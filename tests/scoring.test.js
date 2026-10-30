import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreAnswers } from '../lib/scoring.js'
import { validateWeights } from '../lib/validate.js'
import { csvNumber, parseCsv } from '../lib/csv.js'

const OPTIONS = { pg: 'ABCDE', bs: 'BS', mj: 'ABCDEFGHIJK' }

// Reference score with integer arithmetic (no floating point), rounded half up
function expectedScore(key, answers, weights) {
  const active = ['pg', 'bs', 'mj'].filter((s) => key[s].length)
  const wsum = active.reduce((a, s) => a + weights[s], 0)
  if (!wsum) return 0
  const D = active.reduce((a, s) => a * key[s].length, 1) * wsum
  let N = 0
  for (const s of active) {
    const correct = key[s].filter((k) => answers[s].find((a) => Number(a.no) === k.no)?.jawaban === k.answer).length
    N += correct * weights[s] * 100 * (D / (key[s].length * wsum))
  }
  return Math.floor((2 * N + D) / (2 * D))
}

test('score matches the reference for 20000 random exams', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const pick = (s) => s[Math.floor(rand() * s.length)]
  for (let t = 0; t < 20000; t++) {
    const a = Math.floor(rand() * 101)
    const b = Math.floor(rand() * (101 - a))
    const weights = { pg: a, bs: b, mj: 100 - a - b }
    const key = {}
    const answers = {}
    for (const sec of ['pg', 'bs', 'mj']) {
      const n = rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 40)
      key[sec] = Array.from({ length: n }, (_, i) => ({ no: i + 1, answer: pick(OPTIONS[sec]) }))
      // AI may return numbers as strings and skip questions
      answers[sec] = key[sec]
        .filter(() => rand() > 0.05)
        .map((k) => ({ no: rand() < 0.5 ? k.no : String(k.no), jawaban: rand() < 0.6 ? k.answer : pick(OPTIONS[sec] + '-!') }))
    }
    const got = scoreAnswers(answers, key, weights)
    const exp = expectedScore(key, answers, weights)
    assert.equal(got.score, exp)
    assert.equal(got.grade, exp >= 90 ? 'A' : exp >= 80 ? 'B' : exp >= 70 ? 'C' : exp >= 60 ? 'D' : 'E')
  }
})

test('exact .5 rounds up (52.5 -> 53)', () => {
  // 11/22 PG * 34 + 23/40 BS * 17, scaled to 100 over 51 = 52.5
  const key = { pg: Array.from({ length: 22 }, (_, i) => ({ no: i + 1, answer: 'A' })), bs: Array.from({ length: 40 }, (_, i) => ({ no: i + 1, answer: 'B' })), mj: [] }
  const answers = { pg: key.pg.map((k, i) => ({ no: k.no, jawaban: i < 11 ? 'A' : 'B' })), bs: key.bs.map((k, i) => ({ no: k.no, jawaban: i < 23 ? 'B' : 'S' })) }
  assert.equal(scoreAnswers(answers, key, { pg: 34, bs: 17, mj: 49 }).score, 53)
})

test('lowercase and spaced answers are accepted', () => {
  const key = { pg: [{ no: 1, answer: 'A' }], bs: [{ no: 1, answer: 'S' }], mj: [] }
  const r = scoreAnswers({ pg: [{ no: '1', jawaban: ' a' }], bs: [{ no: 1, jawaban: 's ' }] }, key, { pg: 50, bs: 50, mj: 0 })
  assert.equal(r.score, 100)
})

test('weights must be 0-100 and total 100', () => {
  assert.equal(validateWeights({ pg: 70, bs: 20, mj: 10 }), null)
  assert.ok(validateWeights({ pg: 150, bs: -50, mj: 0 }))
  assert.ok(validateWeights({ pg: '70', bs: 20, mj: 10 }))
  assert.ok(validateWeights({ pg: 50, bs: 20, mj: 20 }))
})

test('csv: ; and , delimiters, Excel-friendly numbers', () => {
  assert.deepEqual(parseCsv('Nama,NIS\n"Budi, S.Pd",002'), [['Nama', 'NIS'], ['Budi, S.Pd', '002']])
  assert.deepEqual(parseCsv('Nama;NIS\nAndi;001'), [['Nama', 'NIS'], ['Andi', '001']])
  assert.equal(csvNumber('100.00'), '100')
  assert.equal(csvNumber('82.50'), '82,5')
  assert.equal(csvNumber(''), '')
})
