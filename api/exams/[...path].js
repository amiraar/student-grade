import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { json, error } from '../../lib/response.js'
import { normalizeAnswerKey, validateExamPayload } from '../../lib/exam.js'
import { csvResponse } from '../../lib/csv.js'

export const config = { runtime: 'nodejs22.x' }

const sortable = new Set(['title', 'subject', 'exam_date', 'created_at'])
const resultsSortable = new Set(['score', 'graded_at'])

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

  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const idSegment = segments[2]
  const sub = segments[3]
  const sub2 = segments[4]

  // /api/exams — list or create
  if (!idSegment) {
    if (req.method === 'GET') {
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

      const where = `WHERE ${filters.join(' AND ')}`
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
      let body
      try {
        body = await req.json()
      } catch {
        return error('Body request tidak valid', 400)
      }
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

  const id = Number(idSegment)
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  // GET /api/exams/:id/results/export
  if (sub === 'results' && sub2 === 'export') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

    const rows = await query(
      `SELECT s.name AS student_name, s.nis, c.name AS class_name, r.score, r.grade, r.detail, r.graded_at
       FROM results r
       JOIN students s ON s.id = r.student_id
       JOIN exams e ON e.id = r.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE r.exam_id = $1 AND c.teacher_id = $2
       ORDER BY r.score DESC`,
      [id, user.id]
    )

    const header = [
      'Nama Siswa', 'NIS', 'Kelas', 'Nilai', 'Grade',
      'PG Benar', 'PG Salah', 'PG Kosong', 'PG Double',
      'BS Benar', 'BS Salah', 'BS Kosong', 'BS Double',
      'MJ Benar', 'MJ Salah', 'MJ Kosong', 'MJ Double',
      'Tanggal Koreksi'
    ]

    const data = rows.map((row) => {
      const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail || {}
      return [
        row.student_name, row.nis, row.class_name, row.score, row.grade,
        detail.pg?.correct ?? 0, detail.pg?.wrong ?? 0, detail.pg?.empty ?? 0, detail.pg?.double ?? 0,
        detail.bs?.correct ?? 0, detail.bs?.wrong ?? 0, detail.bs?.empty ?? 0, detail.bs?.double ?? 0,
        detail.mj?.correct ?? 0, detail.mj?.wrong ?? 0, detail.mj?.empty ?? 0, detail.mj?.double ?? 0,
        row.graded_at
      ]
    })

    return csvResponse('hasil-ujian.csv', header, data)
  }

  // GET /api/exams/:id/results
  if (sub === 'results') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

    const params = [id, user.id]
    const filters = ['r.exam_id = $1', 'c.teacher_id = $2']

    const search = url.searchParams.get('search')
    const grade = url.searchParams.get('grade')

    if (search) {
      params.push(`%${search.toLowerCase()}%`)
      filters.push(`(LOWER(s.name) LIKE $${params.length} OR LOWER(s.nis) LIKE $${params.length})`)
    }
    if (grade) {
      params.push(grade)
      filters.push(`r.grade = $${params.length}`)
    }

    const where = `WHERE ${filters.join(' AND ')}`
    const { page, perPage, offset } = getPagination(url.searchParams)

    const sort = url.searchParams.get('sort')
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'
    const orderBy = resultsSortable.has(sort) ? `r.${sort}` : 'r.score'

    const totalRows = await query(
      `SELECT COUNT(*)::int AS count
       FROM results r
       JOIN students s ON s.id = r.student_id
       JOIN exams e ON e.id = r.exam_id
       JOIN classes c ON c.id = e.class_id
       ${where}`,
      params
    )
    const total = totalRows[0]?.count ?? 0

    params.push(perPage, offset)
    const data = await query(
      `SELECT r.*, s.name AS student_name, s.nis
       FROM results r
       JOIN students s ON s.id = r.student_id
       JOIN exams e ON e.id = r.exam_id
       JOIN classes c ON c.id = e.class_id
       ${where}
       ORDER BY ${orderBy} ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    return json(withPagination(data, total, page, perPage))
  }

  // /api/exams/:id — CRUD
  if (req.method === 'GET') {
    const data = await getExam(id, user.id)
    if (!data) return error('Ujian tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    const existing = await getExam(id, user.id)
    if (!existing) return error('Ujian tidak ditemukan', 404)

    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
    const { title, subject, exam_date, answer_key, weights } = body || {}

    if (answer_key || weights) {
      const { keyErrors, weightError } = validateExamPayload(
        answer_key || existing.answer_key,
        weights || existing.weights
      )
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
