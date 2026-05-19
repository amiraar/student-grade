import { requireAuth } from '../../../../lib/middleware.js'
import { query } from '../../../../lib/db.js'
import { csvResponse } from '../../../../lib/csv.js'
import { error } from '../../../../lib/response.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method !== 'GET') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const id = Number(url.pathname.split('/').slice(-3)[0])
  if (Number.isNaN(id)) return error('ID tidak valid', 400)

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
    'Nama Siswa',
    'NIS',
    'Kelas',
    'Nilai',
    'Grade',
    'PG Benar',
    'PG Salah',
    'PG Kosong',
    'PG Double',
    'BS Benar',
    'BS Salah',
    'BS Kosong',
    'BS Double',
    'MJ Benar',
    'MJ Salah',
    'MJ Kosong',
    'MJ Double',
    'Tanggal Koreksi'
  ]

  const data = rows.map((row) => {
    const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail || {}
    return [
      row.student_name,
      row.nis,
      row.class_name,
      row.score,
      row.grade,
      detail.pg?.correct ?? 0,
      detail.pg?.wrong ?? 0,
      detail.pg?.empty ?? 0,
      detail.pg?.double ?? 0,
      detail.bs?.correct ?? 0,
      detail.bs?.wrong ?? 0,
      detail.bs?.empty ?? 0,
      detail.bs?.double ?? 0,
      detail.mj?.correct ?? 0,
      detail.mj?.wrong ?? 0,
      detail.mj?.empty ?? 0,
      detail.mj?.double ?? 0,
      row.graded_at
    ]
  })

  return csvResponse('hasil-ujian.csv', header, data)
}
