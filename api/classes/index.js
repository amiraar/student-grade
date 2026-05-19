import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { getPagination } from '../../lib/pagination.js'
import { withPagination } from '../../lib/pagination-response.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs22.x' }

const sortable = new Set(['name', 'academic_year', 'semester', 'created_at'])

export default async function handler(req) {
  if (req.method === 'GET') {
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const params = []
    const filters = ['teacher_id = $1']
    params.push(user.id)

    const url = new URL(req.url)
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

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
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
    const { error: authError, user } = await requireAuth(req)
    if (authError) return authError

    const body = await req.json()
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
