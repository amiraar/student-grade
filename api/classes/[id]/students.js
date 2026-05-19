import { requireAuth } from '../../../lib/middleware.js'
import { query } from '../../../lib/db.js'
import { json, error } from '../../../lib/response.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method !== 'GET') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const { pathname } = new URL(req.url)
  const id = Number(pathname.split('/').slice(-2)[0])

  const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [id, user.id])
  if (!classes.length) return error('Kelas tidak ditemukan', 404)

  const data = await query(
    `SELECT s.*, latest.score AS latest_score
     FROM students s
     LEFT JOIN LATERAL (
       SELECT r.score
       FROM results r
       JOIN exams e ON e.id = r.exam_id
       WHERE r.student_id = s.id
       ORDER BY r.graded_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE s.class_id = $1
     ORDER BY s.name ASC`,
    [id]
  )

  return json({ data })
}
