const rules = { pg: /^[A-E]$/, bs: /^[BS]$/, mj: /^[A-K]$/ }

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
  const values = ['pg', 'bs', 'mj'].map((sec) => weights?.[sec] ?? 0)
  if (values.some((v) => typeof v !== 'number' || v < 0 || v > 100)) return 'Bobot harus angka 0-100'
  const sum = (weights.pg || 0) + (weights.bs || 0) + (weights.mj || 0)
  if (Math.round(sum) !== 100) return 'Total bobot harus 100'
  return null
}

// Optional conversion table chosen by the teacher: table[k] = score for k correct answers (k = 0..totalQuestions)
export function validateScoreTable(table, totalQuestions) {
  if (table === undefined || table === null) return null
  if (!Array.isArray(table) || table.length !== totalQuestions + 1) {
    return `Tabel konversi harus berisi ${totalQuestions + 1} nilai (benar 0 sampai ${totalQuestions})`
  }
  if (table.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) {
    return 'Nilai di tabel konversi harus angka 0-100'
  }
  return null
}
