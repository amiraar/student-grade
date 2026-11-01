// Checks how well Gemini reads YOUR answer sheet photos.
// Usage:
//   GEMINI_API_KEY=... node scripts/test-gemini.mjs foto.jpg jawaban.json
// jawaban.json = what the student really marked, e.g.
//   { "pg": "A B C D - !!", "bs": "B S B", "mj": "C A K" }   ("-" = empty, "!!" = double)
import fs from 'node:fs'
import { analyzeAnswerSheet } from '../lib/gemini.js'

const [photo, expectedFile] = process.argv.slice(2)
if (!photo || !expectedFile || !process.env.GEMINI_API_KEY) {
  console.log('Usage: GEMINI_API_KEY=... node scripts/test-gemini.mjs foto.jpg jawaban.json')
  process.exit(1)
}
const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'))
const truth = {}
const counts = {}
for (const sec of ['pg', 'bs', 'mj']) {
  truth[sec] = String(expected[sec] || '').split(/[\s,;]+/).filter(Boolean).map((a) => a.toUpperCase())
  counts[sec] = truth[sec].length
}

const { answers, sheetQuality } = await analyzeAnswerSheet(fs.readFileSync(photo).toString('base64'), counts)
let total = 0
let correct = 0
for (const sec of ['pg', 'bs', 'mj']) {
  truth[sec].forEach((want, i) => {
    const got = String(answers[sec]?.find((a) => Number(a.no) === i + 1)?.jawaban ?? '(tidak ada)').trim().toUpperCase()
    total++
    if (got === want) correct++
    else console.log(`SALAH ${sec.toUpperCase()} no.${i + 1}: AI membaca "${got}", seharusnya "${want}"`)
  })
}
console.log(`Kualitas foto menurut AI: ${sheetQuality}`)
console.log(`Benar dibaca: ${correct}/${total} (${((correct / Math.max(1, total)) * 100).toFixed(1)}%)`)
