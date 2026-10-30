// Reads a photo of the printed answer sheet (see sheet.js) without AI.
// Steps: find the 4 corner markers -> perspective transform -> measure how dark each bubble is.
import { BUBBLE_RADIUS, MARKER_SIZE, MARKERS, ORIENTATION_MARK, buildLayout, decodeId, idCells, ID_CELL } from './sheet.js'

// Darkness (0 = paper, 1 = black) above which a bubble counts as filled
const FILLED = 0.3
// Marks lighter than this are accepted but flagged for the teacher to check
const SURE = 0.45

// ---------- image helpers (gray = Uint8Array, row-major)

function integralImage(gray, w, h) {
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 1; y <= h; y++) {
    let row = 0
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + x - 1]
      sum[y * (w + 1) + x] = sum[(y - 1) * (w + 1) + x] + row
    }
  }
  return sum
}

// Dark pixels compared to their neighbourhood, so shadows and uneven light do not matter
function darkMask(gray, w, h) {
  const sum = integralImage(gray, w, h)
  const r = Math.max(8, Math.round(Math.max(w, h) / 16))
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const area = (x1 - x0) * (y1 - y0)
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / area
      mask[y * w + x] = gray[y * w + x] < mean * 0.6 ? 1 : 0
    }
  }
  return mask
}

function components(mask, w, h) {
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  const found = []
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue
    let top = 0
    stack[top++] = start
    seen[start] = 1
    let area = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0
    while (top) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      area++; sx += x; sy += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1 }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1 }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w }
    }
    if (area >= 20) found.push({ area, x: sx / area, y: sy / area, bw: maxX - minX + 1, bh: maxY - minY + 1 })
  }
  return found
}

// ---------- geometry

// Perspective transform mapping 4 src points to 4 dst points
export function homography(src, dst) {
  const A = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r
    ;[A[c], A[pivot]] = [A[pivot], A[c]]
    if (Math.abs(A[c][c]) < 1e-12) return null
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return (x, y) => {
    const d = h[6] * x + h[7] * y + 1
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]
  }
}

// Candidate sets of 4 blobs that could be the corner markers (similar size, expected rectangle), best first
function findMarkerQuads(blobs, w, h) {
  const minDim = Math.min(w, h)
  const maxDim = Math.max(w, h)
  const minSide = (MARKER_SIZE / 210) * 0.3 * minDim
  const maxSide = (MARKER_SIZE / 210) * 1.1 * maxDim
  const candidates = blobs
    .filter((b) => {
      const ratio = b.bw / b.bh
      return b.area >= minSide * minSide && b.area <= maxSide * maxSide && ratio > 0.4 && ratio < 2.5 && b.area / (b.bw * b.bh) > 0.45
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 14)

  const expectedAspect = (MARKERS[1].x - MARKERS[0].x) / (MARKERS[3].y - MARKERS[0].y)
  const quads = []
  const n = candidates.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const quad = [candidates[a], candidates[b], candidates[c], candidates[d]]
          const areas = quad.map((q) => q.area)
          // near markers look bigger than far ones under strong perspective
          if (Math.max(...areas) / Math.min(...areas) > 5) continue
          const cx = quad.reduce((s, q) => s + q.x, 0) / 4
          const cy = quad.reduce((s, q) => s + q.y, 0) / 4
          quad.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
          const side = (i) => Math.hypot(quad[i].x - quad[(i + 1) % 4].x, quad[i].y - quad[(i + 1) % 4].y)
          const s = [side(0), side(1), side(2), side(3)]
          const opposite1 = Math.min(s[0], s[2]) / Math.max(s[0], s[2])
          const opposite2 = Math.min(s[1], s[3]) / Math.max(s[1], s[3])
          if (opposite1 < 0.6 || opposite2 < 0.6) continue
          const pairA = (s[0] + s[2]) / 2
          const pairB = (s[1] + s[3]) / 2
          const aspect = Math.min(pairA, pairB) / Math.max(pairA, pairB)
          const aspectError = Math.abs(aspect - expectedAspect)
          if (aspectError > 0.2) continue
          // The sheet must fill a fair part of the photo; this skips small groups of filled bubbles
          if (pairA * pairB < 0.15 * w * h) continue
          // Prefer big, regular quads (the sheet), not small clutter
          const score = aspectError + (1 - opposite1) + (1 - opposite2) + (Math.max(...areas) / Math.min(...areas) - 1) * 0.2 - (pairA * pairB) / (w * h) * 0.5
          quads.push({ score, quad })
        }
  return quads.sort((a, b) => a.score - b.score).slice(0, 20).map((q) => q.quad)
}

// ---------- sampling

function sampler(gray, w, h) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const i = y0 * w + x0
    return gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy
  }
}

// Mean gray inside a circle (mm) on the sheet
function meanInCircle(map, sample, cx, cy, radius) {
  let total = 0
  let n = 0
  const step = radius / 4
  for (let dy = -radius; dy <= radius + 1e-9; dy += step)
    for (let dx = -radius; dx <= radius + 1e-9; dx += step) {
      if (dx * dx + dy * dy > radius * radius) continue
      const [x, y] = map(cx + dx, cy + dy)
      total += sample(x, y)
      n++
    }
  return total / n
}

// Paper brightness around a point: a high percentile, so printed lines and marks do not count
function paperAround(map, sample, x0, x1, y) {
  const values = []
  for (let x = x0; x <= x1; x += 1) for (let dy = -3; dy <= 3; dy += 1) values.push(sample(...map(x, y + dy)))
  values.sort((a, b) => a - b)
  return Math.max(1, values[Math.floor(values.length * 0.9)])
}

// ---------- main

// gray: Uint8Array of w*h. counts: questions per section from the answer key.
// Returns null when no answer sheet template is found in the photo.
export function readSheet(gray, w, h, counts) {
  const sample = sampler(gray, w, h)
  const template = MARKERS.map((m) => [m.x, m.y])
  const darkAt = (map, x, y, radius, paperY = y) => 1 - meanInCircle(map, sample, x, y, radius) / paperAround(map, sample, x - 6, x + 6, paperY)

  // Each candidate quad is tried in all 4 rotations. A position is accepted only when the 4 markers
  // and the orientation mark are dark and the printed ID strip has a valid checksum,
  // so a wrong match is rejected instead of producing wrong answers.
  let map = null
  let id = null
  for (const quad of findMarkerQuads(components(darkMask(gray, w, h), w, h), w, h)) {
    for (let k = 0; k < 4 && !map; k++) {
      const m = homography(template, [0, 1, 2, 3].map((i) => [quad[(i + k) % 4].x, quad[(i + k) % 4].y]))
      if (!m) continue
      if (darkAt(m, ORIENTATION_MARK.x, ORIENTATION_MARK.y, ORIENTATION_MARK.size / 2.5, 22) < 0.4) continue
      if (MARKERS.some((mk) => darkAt(m, mk.x, mk.y, MARKER_SIZE / 3, mk.y < 100 ? mk.y + 8 : mk.y - 8) < 0.4)) continue
      const bits = idCells().map((cell) => (darkAt(m, cell.x, cell.y, ID_CELL.size / 3, cell.y - 4) > 0.4 ? 1 : 0))
      const decoded = decodeId(bits, counts)
      if (!decoded) continue
      map = m
      id = decoded
    }
    if (map) break
  }
  if (!map) return null

  const { sections } = buildLayout(counts)
  const answers = { pg: [], bs: [], mj: [] }
  for (const section of sections) {
    for (const q of section.questions) {
      const paper = paperAround(map, sample, q.labelX, q.labelX + section.rowWidth, q.y)
      const darkness = q.bubbles.map((b) => Math.max(0, 1 - meanInCircle(map, sample, b.x, b.y, BUBBLE_RADIUS * 0.6) / paper))
      answers[section.key].push({ no: q.no, ...decide(q.bubbles.map((b) => b.option), darkness) })
    }
  }
  return { answers, id }
}

function decide(options, darkness) {
  const order = darkness.map((d, i) => i).sort((a, b) => darkness[b] - darkness[a])
  const [first, second] = order
  const d1 = darkness[first]
  const d2 = second === undefined ? 0 : darkness[second]
  if (d1 < FILLED) return { jawaban: '-', ragu: d1 > FILLED / 2 }
  if (d2 >= FILLED) {
    // Second mark much lighter: probably an erased answer
    if (d1 - d2 >= 0.3 && d2 < SURE) return { jawaban: options[first], ragu: true }
    return { jawaban: '!!', ragu: d2 < SURE }
  }
  return { jawaban: options[first], ragu: d1 < SURE || d2 > FILLED / 2 }
}

// ---------- browser helper

// Decode an image file and return a gray image no larger than maxSize px
export function fileToGray(file, maxSize = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      const rgba = ctx.getImageData(0, 0, w, h).data
      const gray = new Uint8Array(w * h)
      for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000
      resolve({ gray, w, h })
    }
    img.onerror = () => reject(new Error('File bukan gambar yang bisa dibaca. Gunakan JPG/PNG.'))
    img.src = URL.createObjectURL(file)
  })
}
