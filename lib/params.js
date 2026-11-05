// Values from the URL or a JSON body, checked before they reach a typed SQL column.
const MAX_INTEGER = 2147483647

// A positive whole number that fits an INTEGER column, otherwise null
export function parseId(value) {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^\d{1,10}$/.test(text)) return null
  const id = Number(text)
  return id >= 1 && id <= MAX_INTEGER ? id : null
}

export function parseSemester(value) {
  const semester = parseId(value)
  return semester === 1 || semester === 2 ? semester : null
}

// The error message when a value is not text that fits its column, otherwise null
export function textError(value, label, maxLength) {
  if (typeof value !== 'string') return `${label} harus berupa teks`
  return value.length > maxLength ? `${label} maksimal ${maxLength} karakter` : null
}
