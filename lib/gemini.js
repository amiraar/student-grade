const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

function detectMimeType(base64Image) {
  if (base64Image.startsWith('/9j/')) return 'image/jpeg'
  if (base64Image.startsWith('iVBOR')) return 'image/png'
  return 'image/jpeg'
}

async function callGemini(prompt, base64Image) {
  const mimeType = detectMimeType(base64Image)
  const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }
      ],
      generationConfig: { temperature: 0 }
    })
  })
  const data = await response.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

export async function analyzeAnswerSheet(base64Image) {
  const layout = await callGemini(
    `
You are an exam answer sheet analyzer.
Look at this answer sheet image carefully.
Identify the sections and their content. Return ONLY this JSON,
no explanation, no markdown:
{
  "sections": {
    "pg": {
      "found": true,
      "question_count": 15,
      "options_per_question": ["A","B","C","D"]
    },
    "bs": {
      "found": true,
      "question_count": 5,
      "options_per_question": ["B","S"]
    },
    "mj": {
      "found": true,
      "question_count": 5,
      "options_per_question": ["A","B","C","D","E","F","G","H","I","J","K"]
    }
  },
  "sheet_quality": "good|low_contrast|blurry|tilted",
  "readable": true
}
Rules:
- found: true only if the section is clearly visible
- question_count: actual number of questions you can see
- readable: false if image is too blurry or dark to read reliably
- If a section does not exist in the image set found: false
  `,
    base64Image
  )

  if (!layout.readable) {
    throw new Error(`Gambar tidak bisa dibaca: ${layout.sheet_quality}`)
  }

  const sectionLines = []
  if (layout.sections.pg.found)
    sectionLines.push(
      `- Pilihan Ganda: ${layout.sections.pg.question_count} soal, opsi ${layout.sections.pg.options_per_question.join('/')}`
    )
  if (layout.sections.bs.found)
    sectionLines.push(`- Benar/Salah: ${layout.sections.bs.question_count} soal, opsi B/S`)
  if (layout.sections.mj.found)
    sectionLines.push(
      `- Menjodohkan: ${layout.sections.mj.question_count} soal, opsi ${layout.sections.mj.options_per_question.join('/')}`
    )
  const sectionContext = sectionLines.join('\n')

  const answers = await callGemini(
    `
You are an exam answer sheet reader. Your only job is to read exactly
what the student marked — do not guess, do not correct.

This answer sheet has the following sections confirmed from prior analysis:
${sectionContext}

Read every marked answer carefully. A marked answer can be:
- A filled/darkened bubble
- A cross (X) or check mark inside a bubble
- A circled option
- A written letter next to the question number

Return ONLY this JSON, no explanation, no markdown:
{
  "pg": [{"no": 1, "jawaban": "A"}, ...],
  "bs": [{"no": 1, "jawaban": "B"}, ...],
  "mj": [{"no": 1, "jawaban": "D"}, ...]
}

Strict rules:
- jawaban must be EXACTLY one of the valid options for that section
- If no mark is visible for a question: "jawaban": "-"
- If two or more options are marked for one question: "jawaban": "!!"
- If mark is ambiguous but leans toward one option: pick that option
- Never skip a question number — always include every number up to question_count
- Do not infer what the correct answer should be — only read what is marked
  `,
    base64Image
  )

  return {
    answers,
    layout,
    sheetQuality: layout.sheet_quality
  }
}
