import { requireAuth } from '../../../lib/middleware.js'
import { query } from '../../../lib/db.js'
import { getPagination } from '../../../lib/pagination.js'
import { withPagination } from '../../../lib/pagination-response.js'
import { json, error } from '../../../lib/response.js'

export const config = { runtime: 'nodejs' }

const sortable = new Set(['score', 'graded_at'])

export default async function handler(req) {
  if (req.method !== 'GET') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const id = Number(url.pathname.split('/').slice(-2)[0])
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

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
  const orderBy = sortable.has(sort) ? `r.${sort}` : 'r.score'

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
