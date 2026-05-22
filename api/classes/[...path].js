import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { json, error } from '../../lib/response.js'

const sortable = new Set(['name', 'academic_year', 'semester', 'created_at'])

async function getClass(id, teacherId) {
  const rows = await query('SELECT * FROM classes WHERE id = $1 AND teacher_id = $2', [id, teacherId])
  return rows[0]
}

export default async function handler(req) {
  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost'
  const url = new URL(req.url, `${proto}://${host}`)
  const segments = url.pathname.split('/').filter(Boolean)
  const idSegment = segments[2]
  const sub = segments[3]

  // /api/classes — list or create
  if (!idSegment) {
    if (req.method === 'GET') {
      const params = [user.id]
      const filters = ['teacher_id = $1']

      const search = url.searchParams.get('search')
      const academicYear = url.searchParams.get('academic_year')
      const semester = url.searchParams.get('semester')

      if (search) {
        params.push(`%${search.toLowerCase()}%`)
        filters.push(`LOWER(name) LIKE $${params.length}`)
      }
      if (academicYear) {
        params.push(academicYear)
        filters.push(`academic_year = $${params.length}`)
      }
      if (semester) {
        params.push(Number(semester))
        filters.push(`semester = $${params.length}`)
      }

      const where = `WHERE ${filters.join(' AND ')}`
      const { page, perPage, offset } = getPagination(url.searchParams)

      const sort = url.searchParams.get('sort')
      const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'
      const orderBy = sortable.has(sort) ? sort : 'created_at'

      const totalRows = await query(`SELECT COUNT(*)::int AS count FROM classes ${where}`, params)
      const total = totalRows[0]?.count ?? 0

      params.push(perPage, offset)
      const data = await query(
        `SELECT * FROM classes ${where} ORDER BY ${orderBy} ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
      const { name, academic_year, semester } = body || {}
      if (!name || !academic_year || !semester) {
        return error('Nama, tahun ajaran, dan semester wajib diisi', 400)
      }

      const rows = await query(
        `INSERT INTO classes (teacher_id, name, academic_year, semester)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.id, name, academic_year, Number(semester)]
      )

      return json(rows[0], 201)
    }

    return error('Method not allowed', 405)
  }

  const id = Number(idSegment)
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  // GET /api/classes/:id/students
  if (sub === 'students') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

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

  // GET /api/classes/:id/report
  if (sub === 'report') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

    const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [id, user.id])
    if (!classes.length) return error('Kelas tidak ditemukan', 404)

    const examId = url.searchParams.get('exam_id')
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

  // /api/classes/:id — CRUD
  if (req.method === 'GET') {
    const data = await getClass(id, user.id)
    if (!data) return error('Kelas tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
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
