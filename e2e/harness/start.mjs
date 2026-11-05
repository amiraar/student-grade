// Prepares everything the suite needs, then runs the harness server:
// fresh database -> schema and seed -> production build of the frontend -> server.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const composeFile = join(here, '..', 'docker-compose.yml')
const NEON_ENDPOINT = 'http://127.0.0.1:54444/sql'
const isWindows = process.platform === 'win32'

const compose = (...args) => ['compose', '-f', composeFile, ...args]

function step(message) {
  console.log(`[e2e] ${message}`)
}

function applySql(file) {
  const run = spawnSync('docker', compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'main', '-v', 'ON_ERROR_STOP=1', '-q'), {
    input: readFileSync(join(root, file)),
    stdio: ['pipe', 'inherit', 'inherit']
  })
  if (run.status !== 0) throw new Error(`Failed to apply ${file}`)
}

async function waitForProxy() {
  const deadline = Date.now() + 60_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NEON_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': 'postgres://postgres:postgres@db.localtest.me:5432/main'
        },
        body: JSON.stringify({ query: 'SELECT 1', params: [] })
      })
      if (res.ok) return
      lastError = new Error(`proxy answered ${res.status}: ${await res.text()}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`Neon proxy not ready: ${lastError?.message}`)
}

function npm(args, cwd, env = {}) {
  // Windows needs a shell to run npm.cmd
  execFileSync('npm', args, { cwd, stdio: 'inherit', shell: isWindows, env: { ...process.env, ...env } })
}

step(`node ${process.version}`)
step('starting a fresh database')
execFileSync('docker', compose('down', '-v', '--remove-orphans'), { stdio: 'inherit' })
execFileSync('docker', compose('up', '-d', '--wait'), { stdio: 'inherit' })

step('applying migrations and seed')
for (const file of readdirSync(join(root, 'migrations')).sort()) applySql(`migrations/${file}`)
applySql('seed/001_seed.sql')
await waitForProxy()

const frontend = join(root, 'frontend')
if (!existsSync(join(frontend, 'node_modules'))) {
  step('installing frontend dependencies from the lockfile')
  npm(['ci'], frontend)
}
step('building the frontend for production')
npm(['run', 'build'], frontend, { VITE_API_BASE_URL: '/api' })

step('starting the harness')
const server = spawn(process.execPath, [join(here, 'server.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, E2E_NEON_ENDPOINT: NEON_ENDPOINT }
})
server.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill())
