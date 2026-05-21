import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { decodeCsvInput, parseCsv } from '../../lib/csv.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs' }

const sortable = new Set(['name', 'nis', 'created_at'])

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

  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const idSegment = segments[2]
  const sub = segments[3]

  // /api/students — list or create
  if (!idSegment) {
    if (req.method === 'GET') {
      const params = [user.id]
      const filters = ['c.teacher_id = $1']

      const search = url.searchParams.get('search')
      const classId = url.searchParams.get('class_id')
      const academicYear = url.searchParams.get('academic_year')
      const semester = url.searchParams.get('semester')

      if (search) {
        params.push(`%${search.toLowerCase()}%`)
        filters.push(`(LOWER(s.name) LIKE $${params.length} OR LOWER(s.nis) LIKE $${params.length})`)
      }
      if (classId) {
        params.push(Number(classId))
        filters.push(`s.class_id = $${params.length}`)
      }
      if (academicYear) {
        params.push(academicYear)
        filters.push(`c.academic_year = $${params.length}`)
      }
      if (semester) {
        params.push(Number(semester))
        filters.push(`c.semester = $${params.length}`)
      }

      const where = `WHERE ${filters.join(' AND ')}`
      const { page, perPage, offset } = getPagination(url.searchParams)

      const sort = url.searchParams.get('sort')
      const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'
      const orderBy = sortable.has(sort) ? `s.${sort}` : 's.created_at'

      const totalRows = await query(
        `SELECT COUNT(*)::int AS count
         FROM students s
         JOIN classes c ON c.id = s.class_id
         ${where}`,
        params
      )
      const total = totalRows[0]?.count ?? 0

      params.push(perPage, offset)
      const data = await query(
        `SELECT s.*, c.name AS class_name, c.academic_year, c.semester
         FROM students s
         JOIN classes c ON c.id = s.class_id
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
      const { class_id, name, nis } = body || {}
      if (!class_id || !name || !nis) return error('class_id, nama, dan NIS wajib diisi', 400)

      const classes = await query('SELECT id FROM classes WHERE id = $1 AND teacher_id = $2', [
        Number(class_id),
        user.id
      ])
      if (!classes.length) return error('Kelas tidak ditemukan', 404)

      const rows = await query(
        `INSERT INTO students (class_id, name, nis)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [Number(class_id), name, nis]
      )

      return json(rows[0], 201)
    }

    return error('Method not allowed', 405)
  }

  // POST /api/students/import — must be checked before numeric id parsing
  if (idSegment === 'import') {
    if (req.method !== 'POST') return error('Method not allowed', 405)

    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
    const { class_id, csv } = body || {}
    if (!csv) return error('CSV wajib diisi', 400)

    const content = decodeCsvInput(csv)
    const rows = parseCsv(content)
    if (!rows.length) return error('CSV kosong', 422)

    let startIndex = 0
    const header = rows[0].map((item) => item.toLowerCase())
    const hasHeader = header.includes('nama') || header.includes('name') || header.includes('nis')
    if (hasHeader) startIndex = 1

    const nameIndex = header.findIndex((item) => ['nama', 'name'].includes(item))
    const nisIndex = header.findIndex((item) => item === 'nis')
    const classIndex = header.findIndex((item) => item === 'class_id')

    const entries = rows.slice(startIndex).map((row) => ({
      name: row[nameIndex >= 0 ? nameIndex : 0],
      nis: row[nisIndex >= 0 ? nisIndex : 1],
      class_id: row[classIndex >= 0 ? classIndex : 2] || class_id
    }))

    const classIds = [...new Set(entries.map((item) => Number(item.class_id)).filter(Boolean))]
    if (!classIds.length) return error('class_id wajib diisi', 400)

    const classes = await query(
      `SELECT id FROM classes WHERE teacher_id = $1 AND id = ANY($2::int[])`,
      [user.id, classIds]
    )
    const allowed = new Set(classes.map((item) => item.id))

    let inserted = 0
    for (const entry of entries) {
      if (!entry.name || !entry.nis || !entry.class_id) continue
      if (!allowed.has(Number(entry.class_id))) continue
      await query(
        `INSERT INTO students (class_id, name, nis)
         VALUES ($1, $2, $3)
         ON CONFLICT (nis) DO NOTHING`,
        [Number(entry.class_id), entry.name, entry.nis]
      )
      inserted++
    }

    return json({ message: 'Import selesai', inserted })
  }

  const id = Number(idSegment)
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

  // GET /api/students/:id/results
  if (sub === 'results') {
    if (req.method !== 'GET') return error('Method not allowed', 405)

    const params = [id, user.id]
    const filters = ['s.id = $1', 'c.teacher_id = $2']

    const academicYear = url.searchParams.get('academic_year')
    const semester = url.searchParams.get('semester')

    if (academicYear) {
      params.push(academicYear)
      filters.push(`c.academic_year = $${params.length}`)
    }
    if (semester) {
      params.push(Number(semester))
      filters.push(`c.semester = $${params.length}`)
    }

    const where = `WHERE ${filters.join(' AND ')}`
    const { page, perPage, offset } = getPagination(url.searchParams)

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
      `SELECT r.*, e.title AS exam_title, e.subject, e.exam_date
       FROM results r
       JOIN students s ON s.id = r.student_id
       JOIN exams e ON e.id = r.exam_id
       JOIN classes c ON c.id = e.class_id
       ${where}
       ORDER BY r.graded_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    return json(withPagination(data, total, page, perPage))
  }

  // /api/students/:id — CRUD
  if (req.method === 'GET') {
    const data = await getStudent(id, user.id)
    if (!data) return error('Siswa tidak ditemukan', 404)
    return json(data)
  }

  if (req.method === 'PUT') {
    const data = await getStudent(id, user.id)
    if (!data) return error('Siswa tidak ditemukan', 404)

    let body
    try {
      body = await req.json()
    } catch {
      return error('Body request tidak valid', 400)
    }
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
