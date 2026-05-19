import { requireAuth } from '../../lib/middleware.js'
import { query } from '../../lib/db.js'
import { csvResponse } from '../../lib/csv.js'
import { error } from '../../lib/response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'GET') return error('Method not allowed', 405)

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const classId = url.searchParams.get('class_id')
  const academicYear = url.searchParams.get('academic_year')
  const semester = url.searchParams.get('semester')

  const classFilters = ['teacher_id = $1']
  const params = [user.id]

  if (classId) {
    params.push(Number(classId))
    classFilters.push(`id = $${params.length}`)
  }
  if (academicYear) {
    params.push(academicYear)
    classFilters.push(`academic_year = $${params.length}`)
  }
  if (semester) {
    params.push(Number(semester))
    classFilters.push(`semester = $${params.length}`)
  }

  const classRows = await query(`SELECT * FROM classes WHERE ${classFilters.join(' AND ')}`, params)
  if (!classRows.length) return error('Kelas tidak ditemukan', 404)

  const classIds = classRows.map((item) => item.id)

  const exams = await query(
    `SELECT * FROM exams WHERE class_id = ANY($1::int[]) ORDER BY exam_date ASC`,
    [classIds]
  )

  const students = await query(
    `SELECT s.*, c.name AS class_name
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.class_id = ANY($1::int[])
     ORDER BY c.name ASC, s.name ASC`,
    [classIds]
  )

  const examIds = exams.map((item) => item.id)
  const results = examIds.length
    ? await query(
        `SELECT r.exam_id, r.student_id, r.score
         FROM results r
         WHERE r.exam_id = ANY($1::int[])`,
        [examIds]
      )
    : []

  const scoreMap = new Map()
  for (const row of results) {
    scoreMap.set(`${row.student_id}:${row.exam_id}`, row.score)
  }

  const examTitles = exams.map((exam) => exam.title)
  const hasMultipleClasses = !classId && classRows.length > 1

  const header = [
    'Nama Siswa',
    'NIS',
    ...(hasMultipleClasses ? ['Kelas'] : []),
    ...examTitles,
    'Rata-rata'
  ]

  const rows = students.map((student) => {
    const scores = exams.map((exam) => scoreMap.get(`${student.id}:${exam.id}`) ?? '')
    const numericScores = scores.filter((s) => s !== '').map((s) => Number(s))
    const average = numericScores.length
      ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(2)
      : ''

    return [
      student.name,
      student.nis,
      ...(hasMultipleClasses ? [student.class_name] : []),
      ...scores,
      average
    ]
  })

  return csvResponse('laporan-kelas.csv', header, rows)
}
