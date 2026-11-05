import { test, expect } from '@playwright/test'
import { client, newTeacher, randomIp, uid } from '../helpers.js'

test.describe('registration', () => {
  test('creates an account and never returns the password', async ({ request }) => {
    const email = `guru-${uid()}@e2e.test`
    const res = await client(request).post('/auth/register', { name: '  Bu Sari  ', email, password: 'rahasia1' })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'name'])
    expect(res.body.user.name).toBe('Bu Sari')
    expect(res.text).not.toContain('rahasia1')
  })

  test('email is normalized, so case variants are one account', async ({ request }) => {
    const local = `Guru-${uid()}`
    const api = client(request)
    const first = await api.post('/auth/register', { name: 'A', email: `  ${local}@E2E.test `, password: 'rahasia1' })
    expect(first.status).toBe(201)
    expect(first.body.user.email).toBe(`${local.toLowerCase()}@e2e.test`)

    const again = await api.post('/auth/register', { name: 'B', email: `${local.toLowerCase()}@e2e.test`, password: 'rahasia2' })
    expect(again.status).toBe(409)

    const login = await client(request).post('/auth/login', { email: `${local.toUpperCase()}@E2E.TEST`, password: 'rahasia1' })
    expect(login.status).toBe(200)
  })

  test('rejects missing fields and short passwords', async ({ request }) => {
    const api = client(request)
    expect((await api.post('/auth/register', { email: 'a@e2e.test', password: 'rahasia1' })).status).toBe(400)
    expect((await api.post('/auth/register', { name: 'A', password: 'rahasia1' })).status).toBe(400)
    expect((await api.post('/auth/register', { name: 'A', email: 'a@e2e.test' })).status).toBe(400)
    const short = await client(request).post('/auth/register', { name: 'A', email: `${uid()}@e2e.test`, password: '12345' })
    expect(short.status).toBe(422)
    expect(short.body.message).toBe('Kata sandi minimal 6 karakter')
  })

  test('is rate limited after 5 attempts per IP', async ({ request }) => {
    const api = client(request, null, randomIp())
    for (let i = 0; i < 5; i++) {
      expect((await api.post('/auth/register', {})).status).toBe(400)
    }
    const blocked = await api.post('/auth/register', {})
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
  })
})

test.describe('login', () => {
  test('the seed account from the README works', async ({ request }) => {
    const res = await client(request).post('/auth/login', { email: 'guru@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('guru@example.com')
    const classes = await client(request, res.body.token).get('/classes')
    expect(classes.body.data.map((c) => c.name).sort()).toEqual(['X IPA 1', 'X IPA 2'])
  })

  test('wrong password and unknown email give the same answer', async ({ request }) => {
    const teacher = await newTeacher(request)
    const wrong = await client(request).post('/auth/login', { email: teacher.email, password: 'salah-total' })
    const unknown = await client(request).post('/auth/login', { email: `${uid()}@e2e.test`, password: 'salah-total' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
  })

  test('rejects malformed JSON and missing fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: '{not json',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': randomIp() }
    })
    expect(res.status()).toBe(400)
    expect((await client(request).post('/auth/login', { email: 'a@e2e.test' })).status).toBe(400)
  })

  test('only allows POST', async ({ request }) => {
    expect((await client(request).get('/auth/login')).status).toBe(405)
    expect((await client(request).get('/auth/register')).status).toBe(405)
  })

  test('is rate limited after 10 attempts per IP', async ({ request }) => {
    const api = client(request, null, randomIp())
    for (let i = 0; i < 10; i++) {
      expect((await api.post('/auth/login', { email: `${uid()}@e2e.test`, password: 'x' })).status).toBe(401)
    }
    const blocked = await api.post('/auth/login', { email: `${uid()}@e2e.test`, password: 'x' })
    expect(blocked.status).toBe(429)
    expect(blocked.headers['retry-after']).toBeTruthy()
  })
})

test.describe('session', () => {
  test('me returns the logged-in teacher without the password hash', async ({ request }) => {
    const teacher = await newTeacher(request)
    const res = await teacher.api.get('/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual(teacher.user)
    expect(res.text).not.toContain('$2a$')
  })

  test('missing, malformed and tampered tokens are refused', async ({ request }) => {
    const teacher = await newTeacher(request)
    expect((await client(request).get('/auth/me')).status).toBe(401)
    expect((await client(request).get('/auth/me', { Authorization: 'Basic abc' })).status).toBe(401)
    expect((await client(request, 'not-a-token').get('/auth/me')).status).toBe(401)

    const [header, payload, signature] = teacher.token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), id: 1 })).toString('base64url')
    expect((await client(request, `${header}.${forged}.${signature}`).get('/auth/me')).status).toBe(401)
  })

  test('an unsigned (alg=none) token is refused', async ({ request }) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'none' })}.${encode({ id: 1, iss: 'student-grade', aud: 'student-grade-web' })}.`
    expect((await client(request, token).get('/classes')).status).toBe(401)
  })

  test('logout answers 200', async ({ request }) => {
    const teacher = await newTeacher(request)
    const res = await teacher.api.post('/auth/logout')
    expect(res.status).toBe(200)
  })

  test('every protected resource refuses anonymous requests', async ({ request }) => {
    const api = client(request)
    for (const path of ['/classes', '/classes/1', '/classes/1/students', '/classes/1/report', '/students', '/students/1', '/students/1/results', '/exams', '/exams/1', '/exams/1/results', '/exams/1/results/export', '/reports/export']) {
      expect((await api.get(path)).status, path).toBe(401)
    }
    expect((await api.post('/grade', {})).status).toBe(401)
  })
})
