import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { json, error } from '../../lib/response.js'
import { normalizeAnswerKey, validateExamPayload } from '../../lib/exam.js'

export const config = { runtime: 'nodejs22.x' }

async function getExam(id, teacherId) {
  const rows = await query(
    `SELECT e.*
     FROM exams e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = $1 AND c.teacher_id = $2`,
    [id, teacherId]
  )
  const exam = rows[0]
  if (!exam) return null
  return {
    ...exam,
    answer_key: typeof exam.answer_key === 'string' ? JSON.parse(exam.answer_key) : exam.answer_key,
    weights: typeof exam.weights === 'string' ? JSON.parse(exam.weights) : exam.weights
  }
}

export default async function handler(req) {
  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const { pathname } = new URL(req.url)
  const id = Number(pathname.split('/').pop())
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  if (req.method === 'GET') {
    const data = await getExam(id, user.id)
    if (!data) return error('Ujian tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    const existing = await getExam(id, user.id)
    if (!existing) return error('Ujian tidak ditemukan', 404)

    const body = await req.json()
    const { title, subject, exam_date, answer_key, weights } = body || {}

    if (answer_key || weights) {
      const { keyErrors, weightError } = validateExamPayload(answer_key || existing.answer_key, weights || existing.weights)
      if (keyErrors.length) return error(keyErrors.join(', '), 422)
      if (weightError) return error(weightError, 422)
    }

    const normalizedKey = answer_key ? normalizeAnswerKey(answer_key) : existing.answer_key

    const rows = await query(
      `UPDATE exams
       SET title = $1, subject = $2, exam_date = $3, answer_key = $4, weights = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        title || existing.title,
        subject || existing.subject,
        exam_date || existing.exam_date,
        JSON.stringify(normalizedKey),
        JSON.stringify(weights || existing.weights),
        id
      ]
    )

    const updated = rows[0]
    return json({
      ...updated,
      answer_key: typeof updated.answer_key === 'string' ? JSON.parse(updated.answer_key) : updated.answer_key,
      weights: typeof updated.weights === 'string' ? JSON.parse(updated.weights) : updated.weights
    })
  }

  if (req.method === 'DELETE') {
    const existing = await getExam(id, user.id)
    if (!existing) return error('Ujian tidak ditemukan', 404)
    await query('DELETE FROM exams WHERE id = $1', [id])
    return json({ message: 'Ujian dihapus' })
  }

  return error('Method not allowed', 405)
}
