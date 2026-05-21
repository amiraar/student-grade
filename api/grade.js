import { requireAuth } from '../lib/middleware.js'
import { analyzeAnswerSheet } from '../lib/gemini.js'
import { scoreAnswers } from '../lib/scoring.js'
import { normalizeAnswerKey, validateExamPayload } from '../lib/exam.js'
import { query } from '../lib/db.js'
import { json, error } from '../lib/response.js'
import { rateLimit } from '../lib/rate-limit.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { error: authError, user } = await requireAuth(req)
  if (authError) return authError

  const limitError = rateLimit(req, { key: 'grade', limit: 30, windowMs: 60 * 1000 })
  if (limitError) return limitError

  let body
  try {
    body = await req.json()
  } catch {
    return error('Body request tidak valid', 400)
  }
  const { image, exam_id, answer_key, weights, student_id } = body || {}

  const examId = Number(exam_id)
  const studentId = Number(student_id)
  if (!image) return error('Image wajib diisi', 400)
  if (!examId || !studentId) return error('exam_id dan student_id wajib diisi', 400)

  const examRows = await query(
    `SELECT e.id, e.class_id
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
  if (!studentRows.length) return error('Siswa tidak ditemukan', 404)

  const { keyErrors, weightError } = validateExamPayload(answer_key, weights)
  if (keyErrors.length) return error(keyErrors.join(', '), 422)
  if (weightError) return error(weightError, 422)

  const normalizedKey = normalizeAnswerKey(answer_key)

  let answers
  let layout
  let sheetQuality
  try {
    const analysis = await analyzeAnswerSheet(image)
    answers = analysis.answers
    layout = analysis.layout
    sheetQuality = analysis.sheetQuality
  } catch (err) {
    return error(err.message || 'Gagal membaca lembar jawaban', 422)
  }

  const { score, grade, detail } = scoreAnswers(answers, normalizedKey, weights)

  const aiCounts = {
    pg: layout.sections.pg.question_count,
    bs: layout.sections.bs.question_count,
    mj: layout.sections.mj.question_count
  }
  const keyCounts = {
    pg: (normalizedKey.pg || []).filter((k) => k.answer).length,
    bs: (normalizedKey.bs || []).filter((k) => k.answer).length,
    mj: (normalizedKey.mj || []).filter((k) => k.answer).length
  }
  const countMismatch = ['pg', 'bs', 'mj'].some((s) => aiCounts[s] !== keyCounts[s])

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
    sheet_quality: sheetQuality,
    ai_counts: aiCounts,
    key_counts: keyCounts,
    count_mismatch: countMismatch,
    result_id: saved[0]?.id ?? null
  })
}
