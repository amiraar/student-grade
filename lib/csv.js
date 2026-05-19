export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const safe = String(value ?? '')
          if (safe.includes(';') || safe.includes('\n') || safe.includes('"')) {
            return `"${safe.replace(/"/g, '""')}"`
          }
          return safe
        })
        .join(';')
    )
    .join('\n')
}

export function csvResponse(filename, headerRow, rows) {
  const content = '\uFEFF' + toCsv([headerRow, ...rows])
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}

export function decodeCsvInput(input) {
  if (!input) return ''
  const trimmed = input.trim()
  const base64Pattern = /^[A-Za-z0-9+/=\r\n]+$/
  if (base64Pattern.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.includes(';')) {
    try {
      const buffer = Buffer.from(trimmed, 'base64')
      return buffer.toString('utf-8').replace(/^\uFEFF/, '')
    } catch {
      return trimmed
    }
  }
  return trimmed.replace(/^\uFEFF/, '')
}

export function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []
  const rows = lines.map(parseCsvLine)
  return rows
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ';' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  values.push(current.trim())
  return values
}
