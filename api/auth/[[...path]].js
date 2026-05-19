import { query } from '../../lib/db.js'
import { comparePassword, hashPassword } from '../../lib/password.js'
import { signToken } from '../../lib/auth.js'
import { requireAuth } from '../../lib/middleware.js'
import { json, error } from '../../lib/response.js'
import { sanitizeTeacher } from '../../lib/auth-response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  const { pathname } = new URL(req.url)
  const action = pathname.split('/').filter(Boolean)[2]

  // POST /api/auth/login
  if (action === 'login') {
    if (req.method !== 'POST') return error('Method not allowed', 405)

    const body = await req.json()
    const { email, password } = body || {}
    if (!email || !password) return error('Email dan kata sandi wajib diisi', 400)

    const rows = await query('SELECT * FROM teachers WHERE email = $1', [email])
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

    const body = await req.json()
    const { name, email, password } = body || {}
    if (!name || !email || !password) return error('Nama, email, dan kata sandi wajib diisi', 400)
    if (String(password).length < 6) return error('Kata sandi minimal 6 karakter', 422)

    const existing = await query('SELECT id FROM teachers WHERE email = $1', [email])
    if (existing.length) return error('Email sudah terdaftar', 409)

    const hashed = await hashPassword(password)
    const rows = await query(
      'INSERT INTO teachers (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hashed]
    )

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
