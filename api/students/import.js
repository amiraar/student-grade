import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { decodeCsvInput, parseCsv } from '../../lib/csv.js'
import { json, error } from '../../lib/response.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method !== 'POST') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const body = await req.json()
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
