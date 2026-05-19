import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { json, error } from '../../lib/response.js'
import { normalizeAnswerKey, validateExamPayload } from '../../lib/exam.js'

export const config = { runtime: 'nodejs' }

const sortable = new Set(['title', 'subject', 'exam_date', 'created_at'])

export default async function handler(req) {
  if (req.method === 'GET') {
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const url = new URL(req.url)
    const params = [user.id]
    const filters = ['c.teacher_id = $1']

    const search = url.searchParams.get('search')
    const classId = url.searchParams.get('class_id')
    const subject = url.searchParams.get('subject')

    if (search) {
      params.push(`%${search.toLowerCase()}%`)
      filters.push(`(LOWER(e.title) LIKE $${params.length} OR LOWER(e.subject) LIKE $${params.length})`)
    }
    if (classId) {
      params.push(Number(classId))
      filters.push(`e.class_id = $${params.length}`)
    }
    if (subject) {
      params.push(`%${subject.toLowerCase()}%`)
      filters.push(`LOWER(e.subject) LIKE $${params.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const { page, perPage, offset } = getPagination(url.searchParams)

    const sort = url.searchParams.get('sort')
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'
    const orderBy = sortable.has(sort) ? `e.${sort}` : 'e.created_at'

    const totalRows = await query(
      `SELECT COUNT(*)::int AS count
       FROM exams e
       JOIN classes c ON c.id = e.class_id
       ${where}`,
      params
    )
    const total = totalRows[0]?.count ?? 0

    params.push(perPage, offset)
    const data = await query(
      `SELECT e.*, c.name AS class_name
       FROM exams e
       JOIN classes c ON c.id = e.class_id
       ${where}
       ORDER BY ${orderBy} ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    return json(withPagination(data, total, page, perPage))
  }

  if (req.method === 'POST') {
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const body = await req.json()
    const { class_id, title, subject, exam_date, answer_key, weights } = body || {}
    if (!class_id || !title || !subject || !exam_date || !answer_key || !weights) {
      return error('Data ujian tidak lengkap', 400)
    }

    const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [
      Number(class_id),
      user.id
    ])
    if (!classes.length) return error('Kelas tidak ditemukan', 404)

    const { keyErrors, weightError } = validateExamPayload(answer_key, weights)
    if (keyErrors.length) return error(keyErrors.join(', '), 422)
    if (weightError) return error(weightError, 422)

    const normalizedKey = normalizeAnswerKey(answer_key)

    const rows = await query(
      `INSERT INTO exams (class_id, title, subject, exam_date, answer_key, weights)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [Number(class_id), title, subject, exam_date, JSON.stringify(normalizedKey), JSON.stringify(weights)]
    )

    return json(rows[0], 201)
  }

  return error('Method not allowed', 405)
}
