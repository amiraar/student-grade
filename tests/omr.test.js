// Draws answer sheets in memory (same layout as the print page), "photographs" them with
// perspective, rotation, uneven light and noise, then checks the reader gets every answer right.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BUBBLE_RADIUS, ID_CELL, MARKERS, MARKER_SIZE, OPTIONS, ORIENTATION_MARK, buildLayout, encodeId, idCells } from '../frontend/src/lib/sheet.js'
import { homography, readSheet } from '../frontend/src/lib/omr.js'

const counts = { pg: 30, bs: 10, mj: 6 }
let seed = 3
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

function makeStudent() {
  const truth = {}
  const marks = [] // { x, y, ink }
  for (const section of buildLayout(counts).sections) {
    truth[section.key] = section.questions.map((q) => {
      const r = rand()
      const n = q.bubbles.length
      const chosen = Math.floor(rand() * n)
      const other = (chosen + 1 + Math.floor(rand() * (n - 1))) % n
      if (r < 0.08) return '-'
      if (r < 0.14) {
        marks.push({ ...q.bubbles[chosen], ink: 25 }, { ...q.bubbles[other], ink: 25 })
        return '!!'
      }
      if (r < 0.22) marks.push({ ...q.bubbles[other], ink: 200 }) // erased leftover
      marks.push({ ...q.bubbles[chosen], ink: r < 0.4 ? 95 : 25 }) // light pencil or pen
      return q.bubbles[chosen].option
    })
  }
  return { truth, marks }
}

// Gray value of the printed + filled sheet at (x, y) in mm
function sheetPixel(x, y, marks, bits) {
  const inSquare = (c, size) => Math.abs(x - c.x) <= size / 2 && Math.abs(y - c.y) <= size / 2
  if (MARKERS.some((m) => inSquare(m, MARKER_SIZE)) || inSquare(ORIENTATION_MARK, ORIENTATION_MARK.size)) return 10
  if (idCells().some((c, i) => bits[i] && inSquare(c, ID_CELL.size))) return 10
  for (const m of marks) if ((x - m.x) ** 2 + (y - m.y) ** 2 <= (BUBBLE_RADIUS * 0.95) ** 2) return m.ink
  for (const s of buildLayout(counts).sections)
    for (const q of s.questions) {
      if (Math.abs(y - q.y) > BUBBLE_RADIUS + 0.3) continue
      for (const b of q.bubbles) if (Math.abs(Math.hypot(x - b.x, y - b.y) - BUBBLE_RADIUS) < 0.15) return 90
    }
  return 240
}

// corners = where the sheet's TL, TR, BR, BL corners land in the photo
function photograph(student, examId, studentId, w, h, corners, light = 1) {
  const bits = encodeId(examId, studentId, counts)
  const toSheet = homography(corners, [[0, 0], [210, 0], [210, 297], [0, 297]])
  const gray = new Uint8Array(w * h)
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const [x, y] = toSheet(px, py)
      const inside = x >= 0 && y >= 0 && x <= 210 && y <= 297
      const shade = 1 - (1 - light) * (px / w) // darker towards one side
      const v = (inside ? sheetPixel(x, y, student.marks, bits) : 60) * shade + (rand() - 0.5) * 16
      gray[py * w + px] = Math.max(0, Math.min(255, v))
    }
  return gray
}

const cases = [
  { name: 'straight', w: 840, h: 1188, corners: [[0, 0], [840, 0], [840, 1188], [0, 1188]] },
  { name: 'perspective + shadow', w: 1000, h: 1300, corners: [[90, 70], [930, 120], [880, 1250], [60, 1180]], light: 0.55 },
  { name: 'rotated 90 (landscape photo)', w: 1300, h: 1000, corners: [[1220, 80], [1240, 920], [60, 900], [90, 60]] },
  { name: 'upside down', w: 1000, h: 1300, corners: [[930, 1230], [80, 1250], [60, 60], [940, 90]] }
]

for (const c of cases) {
  test(`reads every answer: ${c.name}`, () => {
    const student = makeStudent()
    const gray = photograph(student, 7, 205, c.w, c.h, c.corners, c.light)
    const result = readSheet(gray, c.w, c.h, counts)
    assert.ok(result, 'sheet found')
    assert.deepEqual(result.id, { examId: 7, studentId: 205 })
    for (const sec of ['pg', 'bs', 'mj']) {
      assert.deepEqual(result.answers[sec].map((a) => a.jawaban), student.truth[sec], sec)
    }
  })
}

test('photo without the template is rejected, not guessed', () => {
  const w = 800
  const h = 1000
  const gray = new Uint8Array(w * h).map(() => 120 + rand() * 100)
  assert.equal(readSheet(gray, w, h, counts), null)
})

test('a printed ID that does not match its checksum is rejected', () => {
  const student = makeStudent()
  const gray = photograph(student, 7, 205, 840, 1188, [[0, 0], [840, 0], [840, 1188], [0, 1188]])
  // black out part of the ID strip (e.g. a pen stroke over it)
  const map = homography([[0, 0], [210, 0], [210, 297], [0, 297]], [[0, 0], [840, 0], [840, 1188], [0, 1188]])
  for (let x = 40; x < 80; x += 0.2) {
    const [px, py] = map(x, ID_CELL.y)
    for (let d = -6; d <= 6; d++) gray[Math.round(py + d) * 840 + Math.round(px)] = 0
  }
  assert.equal(readSheet(gray, 840, 1188, counts), null)
})

test('a sheet printed before the number of questions changed is rejected', () => {
  const student = makeStudent()
  const gray = photograph(student, 7, 205, 840, 1188, [[0, 0], [840, 0], [840, 1188], [0, 1188]])
  assert.ok(readSheet(gray, 840, 1188, counts))
  assert.equal(readSheet(gray, 840, 1188, { ...counts, pg: counts.pg + 5 }), null)
})

test('layout covers all options', () => {
  const { sections, fits } = buildLayout(counts)
  assert.ok(fits)
  assert.deepEqual(sections.map((s) => s.questions[0].bubbles.length), [OPTIONS.pg.length, OPTIONS.bs.length, OPTIONS.mj.length])
})
