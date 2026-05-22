import { query } from '../../lib/db.js'
import { comparePassword, hashPassword } from '../../lib/password.js'
import { signToken } from '../../lib/auth.js'
import { requireAuth } from '../../lib/middleware.js'
import { json, error, corsHeaders } from '../../lib/response.js'
import { sanitizeTeacher } from '../../lib/auth-response.js'
import { rateLimit } from '../../lib/rate-limit.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    })
  }

  const { pathname } = new URL(req.url)
  const action = pathname.split('/').filter(Boolean)[2]

  // POST /api/auth/login
  if (action === 'login') {
    if (req.method !== 'POST') return error('Method not allowed', 405)

    const limitError = await rateLimit(req, { key: 'auth:login', limit: 10, windowMs: 10 * 60 * 1000 })
    if (limitError) return limitError

    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
    const { email, password } = body || {}
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail || !password) return error('Email dan kata sandi wajib diisi', 400)

    const rows = await query('SELECT * FROM teachers WHERE email = $1', [normalizedEmail])
    const teacher = rows[0]
    if (!teacher) return error('Email atau kata sandi salah', 401)

    const valid = await comparePassword(password, teacher.password)
    if (!valid) return error('Email atau kata sandi salah', 401)

    const user = sanitizeTeacher(teacher)
    const token = await signToken(user)
    return json({ token, user })
  }

  // POST /api/auth/register
  if (action === 'register') {
    if (req.method !== 'POST') return error('Method not allowed', 405)

    const limitError = await rateLimit(req, { key: 'auth:register', limit: 5, windowMs: 10 * 60 * 1000 })
    if (limitError) return limitError

    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
    const { name, email, password } = body || {}
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = String(name || '').trim()
    if (!normalizedName || !normalizedEmail || !password) {
      return error('Nama, email, dan kata sandi wajib diisi', 400)
    }
    if (String(password).length < 6) return error('Kata sandi minimal 6 karakter', 422)

    const existing = await query('SELECT id FROM teachers WHERE email = $1', [normalizedEmail])
    if (existing.length) return error('Email sudah terdaftar', 409)

    let rows
    try {
      const hashed = await hashPassword(password)
      rows = await query(
        'INSERT INTO teachers (name, email, password) VALUES ($1, $2, $3) RETURNING *',
        [normalizedName, normalizedEmail, hashed]
      )
    } catch (err) {
      if (err?.code === '23505') return error('Email sudah terdaftar', 409)
      throw err
    }

    const user = sanitizeTeacher(rows[0])
    const token = await signToken(user)
    return json({ token, user }, 201)
  }

  // GET /api/auth/me
  if (action === 'me') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const rows = await query('SELECT * FROM teachers WHERE id = $1', [user.id])
    if (!rows.length) return json({ message: 'User tidak ditemukan' }, 404)
    return json({ user: sanitizeTeacher(rows[0]) })
  }

  // POST /api/auth/logout
  if (action === 'logout') {
    if (req.method !== 'POST') return error('Method not allowed', 405)
    return json({ message: 'Logout berhasil' })
  }

  return error('Not found', 404)
}
