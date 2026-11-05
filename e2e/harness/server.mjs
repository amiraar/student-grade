// Local stand-in for Vercel: serves the production build and the real api/*.js handlers,
// routed by the real vercel.json. It never reads .env, so it cannot reach the real database.
import http from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dist = join(root, 'frontend', 'dist')
const PORT = Number(process.env.E2E_PORT || 54173)
const NEON_ENDPOINT = process.env.E2E_NEON_ENDPOINT || 'http://127.0.0.1:54444/sql'

// Fixed values on purpose: anything inherited from the shell is overwritten.
process.env.DATABASE_URL = 'postgres://postgres:postgres@db.localtest.me:5432/main'
process.env.JWT_SECRET = 'e2e-only-secret-not-used-anywhere-else-0123456789'
process.env.GEMINI_API_KEY = 'e2e-fake-key'
for (const name of ['CORS_ORIGIN', 'VERCEL_URL', 'UPSTASH_REDIS_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'GEMINI_MODEL', 'JWT_ISSUER', 'JWT_AUDIENCE']) {
  delete process.env[name]
}

// What the fake Gemini answers. The image payload selects the scenario.
function geminiStub(init) {
  const image = JSON.parse(init.body).contents[0].parts[1].inline_data.data
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const text = (value) => reply(200, { candidates: [{ content: { parts: [{ text: value }] } }] })
  if (image === 'E2E_HTTP_500') return reply(500, { error: { message: 'stub failure' } })
  if (image === 'E2E_GARBAGE') return text('this is not json')
  if (image === 'E2E_UNREADABLE') return text(JSON.stringify({ readable: false, sheet_quality: 'blurry' }))
  if (image === 'E2E_BAD_SHAPE') return text(JSON.stringify({ readable: true, sheet_quality: 'good', pg: 'ABC', bs: [], mj: [] }))
  return text(
    JSON.stringify({
      readable: true,
      sheet_quality: 'good',
      pg: [{ no: 1, jawaban: 'A' }, { no: 2, jawaban: 'B' }, { no: 3, jawaban: 'E' }],
      bs: [],
      mj: []
    })
  )
}

// Only the local proxy is reachable; any other outbound call is an error, not a real request.
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(input?.url ?? input)
  if (url.href === NEON_ENDPOINT) return realFetch(input, init)
  if (url.hostname === 'generativelanguage.googleapis.com') return geminiStub(init)
  throw new Error(`E2E harness blocked outbound request to ${url.host}`)
}

// Same module instance lib/db.js gets, so the setting applies to it.
const driverPath = join(root, 'node_modules', '@neondatabase', 'serverless', 'index.mjs')
const { neonConfig } = await import(pathToFileURL(driverPath).href)
neonConfig.fetchEndpoint = NEON_ENDPOINT

const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const toRegex = (source) => new RegExp(`^${source}$`)
const rewrites = vercel.rewrites.map((r) => ({ regex: toRegex(r.source), destination: r.destination }))
const headerRules = vercel.headers.map((r) => ({ regex: toRegex(r.source), headers: r.headers }))

const handlers = {}
for (const name of ['auth', 'classes', 'exams', 'grade', 'reports', 'students']) {
  handlers[name] = (await import(pathToFileURL(join(root, 'api', `${name}.js`)).href)).default
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
}

function staticFile(pathname) {
  const file = resolve(dist, `.${decodeURIComponent(pathname)}`)
  if (file !== dist && !file.startsWith(dist + sep)) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

// Vercel order: filesystem (static files, functions) first, then rewrites in order.
function route(pathname, search) {
  const direct = pathname.match(/^\/api\/([a-z]+)$/)
  if (direct && handlers[direct[1]]) return { fn: direct[1], url: pathname + search }
  if (pathname !== '/' && staticFile(pathname)) return { file: staticFile(pathname) }
  if (pathname === '/') return { file: join(dist, 'index.html') }

  for (const rule of rewrites) {
    const match = pathname.match(rule.regex)
    if (!match) continue
    const destination = rule.destination.replace(/\$(\d+)/g, (_, i) => encodeURIComponent(match[Number(i)] ?? ''))
    const target = new URL(destination, 'http://local')
    new URLSearchParams(search).forEach((value, key) => target.searchParams.append(key, value))
    const fn = target.pathname.match(/^\/api\/([a-z]+)$/)
    if (fn && handlers[fn[1]]) return { fn: fn[1], url: target.pathname + target.search }
    return { file: staticFile(target.pathname) }
  }
  return {}
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const server = http.createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, 'http://local')
  for (const rule of headerRules) {
    if (rule.regex.test(pathname)) rule.headers.forEach((h) => res.setHeader(h.key, h.value))
  }

  const target = route(pathname, search)

  if (target.fn) {
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || 'unknown')
      const response = await handlers[target.fn].fetch(
        new Request(`http://${req.headers.host}${target.url}`, { method: req.method, headers, body })
      )
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      // An uncaught throw in a function: Vercel answers 500 FUNCTION_INVOCATION_FAILED.
      console.error(`[unhandled] ${req.method} ${req.url}: ${err?.message}`)
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('X-E2E-Unhandled', '1')
      res.end('FUNCTION_INVOCATION_FAILED')
    }
    return
  }

  if (target.file) {
    res.setHeader('Content-Type', MIME[extname(target.file)] || 'application/octet-stream')
    createReadStream(target.file).pipe(res)
    return
  }

  res.statusCode = 404
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end('NOT_FOUND')
})

server.listen(PORT, '127.0.0.1', () => console.log(`E2E harness on http://127.0.0.1:${PORT}`))
