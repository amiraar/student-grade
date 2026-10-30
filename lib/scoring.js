const toAnswer = (value) => String(value ?? '').trim().toUpperCase()

export function scoreAnswers(aiAnswers, answerKey, weights) {
  const sections = ['pg', 'bs', 'mj']
  const stats = {}
  const totals = {}
  // Per-question review list so the teacher can check what was read
  const items = {}

  sections.forEach((sec) => {
    stats[sec] = { correct: 0, wrong: 0, empty: 0, double: 0 }
    items[sec] = []
    totals[sec] = (answerKey[sec] || []).filter((k) => k.answer).length

    ;(answerKey[sec] || []).forEach((keyItem) => {
      if (!keyItem.answer) return
      const studentAnswer = (aiAnswers?.[sec] || []).find((a) => Number(a.no) === keyItem.no)
      const answer = studentAnswer ? toAnswer(studentAnswer.jawaban) || '-' : '-'
      let status
      if (answer === '-') status = 'empty'
      else if (answer === '!!') status = 'double'
      else if (answer === keyItem.answer) status = 'correct'
      else status = 'wrong'
      stats[sec][status]++
      items[sec].push({ no: keyItem.no, key: keyItem.answer, answer, status })
    })
  })

  const effectiveWeights = redistributeWeights(weights, totals)
  const finalScore =
    (totals.pg ? stats.pg.correct / totals.pg : 0) * effectiveWeights.pg +
    (totals.bs ? stats.bs.correct / totals.bs : 0) * effectiveWeights.bs +
    (totals.mj ? stats.mj.correct / totals.mj : 0) * effectiveWeights.mj

  const score = Math.round(finalScore)
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E'

  return { score, grade, detail: stats, items }
}

function redistributeWeights(weights, totals) {
  const total = weights.pg + weights.bs + weights.mj
  const active = ['pg', 'bs', 'mj'].filter((k) => totals[k] > 0)
  const activeSum = active.reduce((s, k) => s + weights[k], 0)
  if (activeSum <= 0) return { pg: 0, bs: 0, mj: 0 }
  const factor = total / activeSum
  return {
    pg: totals.pg > 0 ? weights.pg * factor : 0,
    bs: totals.bs > 0 ? weights.bs * factor : 0,
    mj: totals.mj > 0 ? weights.mj * factor : 0
  }
}
