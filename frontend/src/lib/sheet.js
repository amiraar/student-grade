// Layout of the printable answer sheet (A4, all units in mm).
// The print page and the reader (omr.js) both use this, so positions always match.

export const PAGE = { width: 210, height: 297 }

// Solid squares in the corners, used to find and straighten the sheet in a photo
export const MARKER_SIZE = 8
export const MARKERS = [
  { x: 14, y: 14 }, // top-left
  { x: 196, y: 14 }, // top-right
  { x: 196, y: 283 }, // bottom-right
  { x: 14, y: 283 } // bottom-left
]
// Small square next to the top-left marker, tells which way is up
export const ORIENTATION_MARK = { x: 24.5, y: 14, size: 4 }

export const OPTIONS = {
  pg: ['A', 'B', 'C', 'D', 'E'],
  bs: ['B', 'S'],
  mj: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
}
export const SECTION_TITLES = { pg: 'Pilihan Ganda', bs: 'Benar / Salah', mj: 'Menjodohkan' }

export const BUBBLE_RADIUS = 2.2
const OPTION_PITCH = 6.2
const ROW_PITCH = 7
const LABEL_WIDTH = 8
const COLUMN_GAP = 6
const CONTENT_LEFT = 16
const CONTENT_RIGHT = 194
const CONTENT_TOP = 34
const CONTENT_BOTTOM = 274
const SECTION_TITLE_HEIGHT = 5
const LETTER_ROW_HEIGHT = 4
const SECTION_GAP = 3

// Printed ID strip at the bottom: exam id (16 bit) + student id (16 bit) + check (8 bit)
export const ID_CELL = { size: 2.6, pitch: 3.6, y: 283, left: 30 }
const ID_BITS = 40

// counts = { pg: 20, bs: 10, mj: 5 }
export function buildLayout(counts) {
  const sections = []
  let y = CONTENT_TOP
  for (const sec of ['pg', 'bs', 'mj']) {
    const count = counts[sec] || 0
    if (!count) continue
    const options = OPTIONS[sec]
    const columnWidth = LABEL_WIDTH + options.length * OPTION_PITCH + COLUMN_GAP
    const columns = Math.max(1, Math.min(count, Math.floor((CONTENT_RIGHT - CONTENT_LEFT + COLUMN_GAP) / columnWidth)))
    const rows = Math.ceil(count / columns)
    const top = y + SECTION_TITLE_HEIGHT + LETTER_ROW_HEIGHT
    const questions = []
    for (let i = 0; i < count; i++) {
      const col = Math.floor(i / rows)
      const row = i % rows
      const left = CONTENT_LEFT + col * columnWidth
      const cy = top + row * ROW_PITCH + ROW_PITCH / 2
      questions.push({
        no: i + 1,
        labelX: left,
        y: cy,
        bubbles: options.map((option, o) => ({ option, x: left + LABEL_WIDTH + o * OPTION_PITCH + OPTION_PITCH / 2, y: cy }))
      })
    }
    const letterRows = Array.from({ length: Math.min(columns, Math.ceil(count / rows)) }, (_, col) =>
      options.map((option, o) => ({ option, x: CONTENT_LEFT + col * columnWidth + LABEL_WIDTH + o * OPTION_PITCH + OPTION_PITCH / 2, y: top - LETTER_ROW_HEIGHT / 2 }))
    )
    sections.push({ key: sec, title: SECTION_TITLES[sec], titleY: y, letterRows, questions, rowWidth: LABEL_WIDTH + options.length * OPTION_PITCH })
    y = top + rows * ROW_PITCH + SECTION_GAP
  }
  return { sections, fits: y <= CONTENT_BOTTOM }
}

export function countsFromKey(answerKey) {
  const counts = {}
  for (const sec of ['pg', 'bs', 'mj']) {
    counts[sec] = Math.max(0, ...(answerKey?.[sec] || []).filter((k) => k.answer).map((k) => Number(k.no)))
  }
  return counts
}

const checksum = (examId, studentId) => (examId * 31 + studentId * 17 + 0x5a) & 0xff

export function encodeId(examId, studentId = 0) {
  const value = [examId & 0xffff, studentId & 0xffff, checksum(examId & 0xffff, studentId & 0xffff)]
  const bits = []
  ;[16, 16, 8].forEach((width, i) => {
    for (let b = width - 1; b >= 0; b--) bits.push((value[i] >> b) & 1)
  })
  return bits
}

// Returns { examId, studentId } or null when the strip is unreadable
export function decodeId(bits) {
  if (bits.length !== ID_BITS) return null
  const read = (from, width) => bits.slice(from, from + width).reduce((v, bit) => v * 2 + bit, 0)
  const examId = read(0, 16)
  const studentId = read(16, 16)
  if (!examId || read(32, 8) !== checksum(examId, studentId)) return null
  return { examId, studentId: studentId || null }
}

export function idCells() {
  return Array.from({ length: ID_BITS }, (_, i) => ({ x: ID_CELL.left + i * ID_CELL.pitch + ID_CELL.size / 2, y: ID_CELL.y }))
}
