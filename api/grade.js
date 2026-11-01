import { requireAuth } from '../lib/middleware.js'
import { analyzeAnswerSheet } from '../lib/gemini.js'
import { scoreAnswers } from '../lib/scoring.js'
import { normalizeAnswerKey } from '../lib/exam.js'
import { query } from '../lib/db.js'
import { json, error } from '../lib/response.js'
import { rateLimit } from '../lib/rate-limit.js'

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value)

// POST /api/grade
// - { exam_id, student_id, image }   -> AI reads the sheet, then scores it
// - { exam_id, student_id, answers } -> answers read from the printed template in the browser
//   (source: 'template') or typed/corrected by the teacher, scored without AI
async function handler(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const limitError = await rateLimit(req, { key: 'grade', limit: 120, windowMs: 60 * 1000 })
  if (limitError) return limitError

  let body
  try {
    body = await req.json()
  } catch {
    return error('Body request tidak valid', 400)
  }
  const { image, answers: manualAnswers, exam_id, student_id, source } = body || {}

  const examId = Number(exam_id)
  const studentId = Number(student_id)
  if (!examId || !studentId) return error('exam_id dan student_id wajib diisi', 400)
  if (!image && (!manualAnswers || typeof manualAnswers !== 'object')) {
    return error('Foto lembar jawaban atau jawaban manual wajib diisi', 400)
  }

  const examRows = await query(
    `SELECT e.id, e.class_id, e.answer_key, e.weights
     FROM exams e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = $1 AND c.teacher_id = $2`,
    [examId, user.id]
  )
  const exam = examRows[0]
  if (!exam) return error('Ujian tidak ditemukan', 404)

  const studentRows = await query(
    `SELECT id FROM students WHERE id = $1 AND class_id = $2`,
    [studentId, exam.class_id]
  )
  if (!studentRows.length) return error('Siswa tidak ditemukan di kelas ujian ini', 404)

  // Always grade against the answer key stored in the database
  const answerKey = normalizeAnswerKey(parseJson(exam.answer_key))
  const weights = parseJson(exam.weights)

  let answers = manualAnswers
  let sheetQuality = source === 'template' ? 'template' : 'manual'
  if (image) {
    const counts = {}
    ;['pg', 'bs', 'mj'].forEach((sec) => {
      counts[sec] = Math.max(0, ...answerKey[sec].filter((k) => k.answer).map((k) => k.no))
    })
    try {
      const analysis = await analyzeAnswerSheet(image, counts)
      answers = analysis.answers
      sheetQuality = analysis.sheetQuality
    } catch (err) {
      return error(err.message || 'Gagal membaca lembar jawaban', 422)
    }
  }

  const { score, grade, detail, items } = scoreAnswers(answers, answerKey, weights)

  const saved = await query(
    `INSERT INTO results (exam_id, student_id, answers, score, grade, detail, sheet_quality, graded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (exam_id, student_id) DO UPDATE
     SET answers=$3, score=$4, grade=$5, detail=$6, sheet_quality=$7, graded_at=NOW()
     RETURNING id`,
    [examId, studentId, JSON.stringify(answers), score, grade, JSON.stringify(detail), sheetQuality]
  )

  return json({
    answers,
    score,
    grade,
    detail,
    items,
    sheet_quality: sheetQuality,
    result_id: saved[0]?.id ?? null
  })
}

export default { fetch: handler }
