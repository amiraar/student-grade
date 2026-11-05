import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default function globalTeardown() {
  const composeFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'docker-compose.yml')
  execFileSync('docker', ['compose', '-f', composeFile, 'down', '-v', '--remove-orphans'], { stdio: 'inherit' })
}
