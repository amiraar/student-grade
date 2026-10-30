import { validateAnswerKey, validateScoreTable, validateWeights } from './validate.js'

export function normalizeAnswerKey(answerKey) {
  const normalized = { pg: [], bs: [], mj: [] }
  ;['pg', 'bs', 'mj'].forEach((sec) => {
    normalized[sec] = (answerKey[sec] || []).map((item) => ({
      no: Number(item.no),
      answer: item.answer ? String(item.answer).toUpperCase() : ''
    }))
  })
  return normalized
}

export function validateExamPayload(answerKey, weights) {
  const keyErrors = validateAnswerKey(answerKey)
  const totalQuestions = ['pg', 'bs', 'mj'].reduce((n, sec) => n + (answerKey[sec] || []).filter((k) => k.answer).length, 0)
  const weightError = validateWeights(weights) || validateScoreTable(weights?.table, totalQuestions)
  return { keyErrors, weightError }
}
