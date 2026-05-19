export function buildSearch(searchParams, column, values, params) {
  if (!values) return
  const trimmed = String(values).trim()
  if (!trimmed) return
  params.push(`LOWER(${column}) LIKE $${params.length + 1}`)
  return `%${trimmed.toLowerCase()}%`
}
