import { requireAuth } from '../lib/middleware.js'
import { analyzeAnswerSheet } from '../lib/gemini.js'
import { scoreAnswers } from '../lib/scoring.js'
import { normalizeAnswerKey, validateExamPayload } from '../lib/exam.js'
import { query } from '../lib/db.js'
import { json, error } from '../lib/response.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const { error: authError } = await requireAuth(req)
  if (authError) return authError

  const body = await req.json()
  const { image, exam_id, answer_key, weights, student_id } = body || {}

  if (!image) return error('Image wajib diisi', 400)
  if (!exam_id || !student_id) return error('exam_id dan student_id wajib diisi', 400)

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
    [exam_id, student_id, JSON.stringify(answers), score, grade, JSON.stringify(detail), sheetQuality]
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
