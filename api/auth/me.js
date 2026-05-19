import { query } from '../../lib/db.js'
import { requireAuth } from '../../lib/middleware.js'
import { json } from '../../lib/response.js'
import { sanitizeTeacher } from '../../lib/auth-response.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405)
  }

  const { error, user } = await requireAuth(req)
  if (error) return error

  const rows = await query('SELECT * FROM teachers WHERE id = $1', [user.id])
  if (!rows.length) {
    return json({ message: 'User tidak ditemukan' }, 404)
  }

  return json({ user: sanitizeTeacher(rows[0]) })
}
