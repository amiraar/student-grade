import { query } from '../../lib/db.js'
import { comparePassword } from '../../lib/password.js'
import { signToken } from '../../lib/auth.js'
import { json, error } from '../../lib/response.js'
import { sanitizeTeacher } from '../../lib/auth-response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const body = await req.json()
  const { email, password } = body || {}
  if (!email || !password) {
    return error('Email dan kata sandi wajib diisi', 400)
  }

  const rows = await query('SELECT * FROM teachers WHERE email = $1', [email])
  const teacher = rows[0]
  if (!teacher) {
    return error('Email atau kata sandi salah', 401)
  }

  const valid = await comparePassword(password, teacher.password)
  if (!valid) {
    return error('Email atau kata sandi salah', 401)
  }

  const user = sanitizeTeacher(teacher)
  const token = await signToken(user)

  return json({ token, user })
}
