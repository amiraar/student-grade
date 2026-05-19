import { validateAnswerKey, validateWeights } from './validate.js'

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
  const weightError = validateWeights(weights)
  return { keyErrors, weightError }
}
