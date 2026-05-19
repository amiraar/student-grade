import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs' }

async function getClass(id, teacherId) {
  const rows = await query('SELECT * FROM classes WHERE id = $1 AND teacher_id = $2', [id, teacherId])
  return rows[0]
}

export default async function handler(req) {
  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const { pathname } = new URL(req.url)
  const id = Number(pathname.split('/').pop())

  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  if (req.method === 'GET') {
    const data = await getClass(id, user.id)
    if (!data) return error('Kelas tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    const body = await req.json()
    const { name, academic_year, semester } = body || {}
    const existing = await getClass(id, user.id)
    if (!existing) return error('Kelas tidak ditemukan', 404)

    const rows = await query(
      `UPDATE classes
       SET name = $1, academic_year = $2, semester = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name || existing.name, academic_year || existing.academic_year, semester || existing.semester, id]
    )

    return json(rows[0])
  }

  if (req.method === 'DELETE') {
    const existing = await getClass(id, user.id)
    if (!existing) return error('Kelas tidak ditemukan', 404)

    await query('DELETE FROM classes WHERE id = $1', [id])
    return json({ message: 'Kelas dihapus' })
  }

  return error('Method not allowed', 405)
}
