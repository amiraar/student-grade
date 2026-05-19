const rules = { pg: /^[ABCD]$/, bs: /^[BS]$/, mj: /^[A-K]$/ }

export function validateAnswerKey(answerKey) {
  const errors = []
  ;['pg', 'bs', 'mj'].forEach((sec) => {
    ;(answerKey[sec] || []).forEach((item) => {
      if (!item.answer) return
      if (!rules[sec].test(item.answer.toUpperCase())) {
        errors.push(`Bagian ${sec.toUpperCase()} No.${item.no}: jawaban tidak valid`)
      }
    })
  })
  return errors
}

export function validateWeights(weights) {
  const sum = (weights.pg || 0) + (weights.bs || 0) + (weights.mj || 0)
  if (Math.round(sum) !== 100) return 'Total bobot harus 100'
  return null
}
