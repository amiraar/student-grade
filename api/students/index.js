import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs' }

const sortable = new Set(['name', 'nis', 'created_at'])

export default async function handler(req) {
  if (req.method === 'GET') {
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const url = new URL(req.url)
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

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
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
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const body = await req.json()
    const { class_id, name, nis } = body || {}
    if (!class_id || !name || !nis) {
      return error('class_id, nama, dan NIS wajib diisi', 400)
    }

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
