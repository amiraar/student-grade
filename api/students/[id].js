import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs' }

async function getStudent(id, teacherId) {
  const rows = await query(
    `SELECT s.*, c.name AS class_name
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND c.teacher_id = $2`,
    [id, teacherId]
  )
  return rows[0]
}

export default async function handler(req) {
  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const { pathname } = new URL(req.url)
  const id = Number(pathname.split('/').pop())
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  if (req.method === 'GET') {
    const data = await getStudent(id, user.id)
    if (!data) return error('Siswa tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    const data = await getStudent(id, user.id)
    if (!data) return error('Siswa tidak ditemukan', 404)

    const body = await req.json()
    const { name, nis, class_id } = body || {}

    let targetClassId = data.class_id
    if (class_id) {
      const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [
        Number(class_id),
        user.id
      ])
      if (!classes.length) return error('Kelas tidak ditemukan', 404)
      targetClassId = Number(class_id)
    }

    const rows = await query(
      `UPDATE students
       SET name = $1, nis = $2, class_id = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name || data.name, nis || data.nis, targetClassId, id]
    )

    return json(rows[0])
  }

  if (req.method === 'DELETE') {
    const data = await getStudent(id, user.id)
    if (!data) return error('Siswa tidak ditemukan', 404)
    await query('DELETE FROM students WHERE id = $1', [id])
    return json({ message: 'Siswa dihapus' })
  }

  return error('Method not allowed', 405)
}
