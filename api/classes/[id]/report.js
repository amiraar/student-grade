import { requireAuth } from '../../../lib/middleware.js'
import { query } from '../../../lib/db.js'
import { json, error } from '../../../lib/response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'GET') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const id = Number(url.pathname.split('/').slice(-2)[0])
  const examId = url.searchParams.get('exam_id')

  const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [id, user.id])
  if (!classes.length) return error('Kelas tidak ditemukan', 404)

  let rows = []
  if (examId) {
    rows = await query(
      `SELECT s.id AS student_id, s.name AS student_name, r.score AS average_score
       FROM students s
       LEFT JOIN results r ON r.student_id = s.id AND r.exam_id = $2
       WHERE s.class_id = $1
       ORDER BY s.name ASC`,
      [id, Number(examId)]
    )
  } else {
    rows = await query(
      `SELECT s.id AS student_id, s.name AS student_name, AVG(r.score)::numeric(5,2) AS average_score
       FROM students s
       LEFT JOIN results r ON r.student_id = s.id
       LEFT JOIN exams e ON e.id = r.exam_id
       WHERE s.class_id = $1
       GROUP BY s.id
       ORDER BY s.name ASC`,
      [id]
    )
  }

  return json({ data: rows })
}
