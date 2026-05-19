import { query } from '../../lib/db.js'
import { hashPassword } from '../../lib/password.js'
import { signToken } from '../../lib/auth.js'
import { json, error } from '../../lib/response.js'
import { sanitizeTeacher } from '../../lib/auth-response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const body = await req.json()
  const { name, email, password } = body || {}
  if (!name || !email || !password) {
    return error('Nama, email, dan kata sandi wajib diisi', 400)
  }
  if (String(password).length < 6) {
    return error('Kata sandi minimal 6 karakter', 422)
  }

  const existing = await query('SELECT id FROM teachers WHERE email = $1', [email])
  if (existing.length) {
    return error('Email sudah terdaftar', 409)
  }

  const hashed = await hashPassword(password)
  const rows = await query(
    'INSERT INTO teachers (name, email, password) VALUES ($1, $2, $3) RETURNING *',
    [name, email, hashed]
  )

  const user = sanitizeTeacher(rows[0])
  const token = await signToken(user)

  return json({ token, user }, 201)
}
