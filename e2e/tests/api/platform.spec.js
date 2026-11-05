import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { client, newTeacher } from '../helpers.js'

const vercel = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'))

test.describe('routing from vercel.json', () => {
  test('every sub-path reaches its handler through the rewrite', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = (await api.post('/classes', { name: 'R', academic_year: '2025/2026', semester: 1 })).body
    expect((await api.get(`/classes/${klass.id}/students`)).body).toEqual({ data: [] })
    expect((await api.get('/auth/me')).status).toBe(200)
    expect((await api.get('/classes/abc')).body.message).toBe('ID tidak valid')
    expect((await api.get('/students/abc')).body.message).toBe('ID tidak valid')
    expect((await api.get('/exams/abc')).body.message).toBe('ID tidak valid')
    expect((await api.get('/reports/none')).body.message).toBe('Not found')
  })

  test('query parameters survive the rewrite', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = (await api.post('/classes', { name: 'Q', academic_year: '2025/2026', semester: 1 })).body
    const res = await api.get(`/classes/${klass.id}/report?exam_id=0`)
    expect(res.status).toBe(200)
  })

  test('unknown API paths give 404 and not the SPA page', async ({ request }) => {
    const res = await request.get('/api/does-not-exist')
    expect(res.status()).toBe(404)
    expect(await res.text()).not.toContain('<div id="app"')
    const auth = await client(request).post('/auth/unknown', {})
    expect(auth.status).toBe(404)
  })

  test('client-side routes serve the SPA, assets are served as files', async ({ request }) => {
    for (const path of ['/', '/login', '/classes/123', '/exams/5/sheet']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(200)
      expect(res.headers()['content-type'], path).toContain('text/html')
      expect(await res.text(), path).toContain('<div id="app"')
    }
    const html = await (await request.get('/')).text()
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)[1]
    const asset = await request.get(script)
    expect(asset.status()).toBe(200)
    expect(asset.headers()['content-type']).toContain('javascript')
  })
})

test.describe('headers', () => {
  test('security headers are present on pages and API', async ({ request }) => {
    for (const path of ['/login', '/api/auth/me']) {
      const headers = (await request.get(path)).headers()
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['x-frame-options'], path).toBe('DENY')
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    }
  })

  test('API responses are not cacheable', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect((await api.get('/classes')).headers['cache-control']).toBe('no-store')
  })

  test('CORS preflight for auth', async ({ request }) => {
    const res = await request.fetch('/api/auth/login', { method: 'OPTIONS' })
    expect(res.status()).toBe(204)
    expect(res.headers()['access-control-allow-methods']).toContain('POST')
  })

  test('vercel.json still defines the rewrites this suite relies on', () => {
    const sources = vercel.rewrites.map((r) => r.source)
    for (const resource of ['auth', 'classes', 'students', 'exams', 'reports']) {
      expect(sources).toContain(`/api/${resource}/(.*)`)
    }
  })
})
