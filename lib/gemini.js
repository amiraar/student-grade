const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const SECTION_INFO = {
  pg: { label: 'Multiple choice', options: 'A/B/C/D/E' },
  bs: { label: 'True/False (B = Benar, S = Salah)', options: 'B/S' },
  mj: { label: 'Matching', options: 'A/B/C/D/E/F/G/H/I/J/K' }
}

function detectMimeType(base64Image) {
  if (base64Image.startsWith('/9j/')) return 'image/jpeg'
  if (base64Image.startsWith('iVBOR')) return 'image/png'
  return 'image/jpeg'
}

async function callGemini(prompt, base64Image) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY belum diset di server')

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: detectMimeType(base64Image), data: base64Image } }
          ]
        }
      ],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Layanan AI gagal (${response.status}): ${data.error?.message || 'tidak diketahui'}`)
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    throw new Error('Hasil AI tidak bisa dibaca. Coba foto ulang.')
  }
}

// counts = number of questions per section, taken from the exam's answer key,
// so the AI does not have to guess how many questions the sheet has.
export async function analyzeAnswerSheet(base64Image, counts) {
  const sectionLines = ['pg', 'bs', 'mj']
    .filter((sec) => counts[sec] > 0)
    .map((sec) => `- "${sec}" (${SECTION_INFO[sec].label}): questions 1-${counts[sec]}, valid options ${SECTION_INFO[sec].options}`)
    .join('\n')

  const result = await callGemini(
    `
You are an exam answer sheet reader. Your only job is to read exactly
what the student marked — do not guess, do not correct.

This answer sheet has exactly these sections (from the teacher's answer key):
${sectionLines}

A marked answer can be:
- A filled/darkened bubble
- A cross (X) or check mark inside a bubble
- A circled option
- A written letter next to the question number
If an answer is crossed out and another option is marked, use the one that is not crossed out.

Return ONLY this JSON:
{
  "readable": true,
  "sheet_quality": "good|low_contrast|blurry|tilted",
  "pg": [{"no": 1, "jawaban": "A"}],
  "bs": [{"no": 1, "jawaban": "B"}],
  "mj": [{"no": 1, "jawaban": "D"}]
}

Strict rules:
- For every section listed above include every question number from 1 to its count. Use [] for sections not listed.
- jawaban must be EXACTLY one of the valid options for that section, in uppercase
- If no mark is visible for a question: "jawaban": "-"
- If two or more options are marked for one question: "jawaban": "!!"
- If a mark is ambiguous but leans toward one option: pick that option
- readable: false only if the image is too blurry or dark to read reliably
- Do not infer what the correct answer should be — only read what is marked
  `,
    base64Image
  )

  if (result.readable === false) {
    throw new Error(`Foto tidak bisa dibaca (${result.sheet_quality || 'kualitas rendah'}). Foto ulang dengan cahaya cukup dan kertas rata.`)
  }

  return {
    answers: { pg: result.pg || [], bs: result.bs || [], mj: result.mj || [] },
    sheetQuality: result.sheet_quality || null
  }
}
