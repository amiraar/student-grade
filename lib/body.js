// Postgres refuses NUL characters and unpaired surrogates, in text columns and inside JSONB alike
const storable = (value) => {
  if (typeof value === 'string') return !value.includes('\0') && value.isWellFormed()
  if (Array.isArray(value)) return value.every(storable)
  if (value && typeof value === 'object') return Object.entries(value).every(([key, item]) => storable(key) && storable(item))
  return true
}

// Rejects when the body is not JSON or holds text the database cannot store
export async function readJson(req) {
  const body = await req.json()
  if (!storable(body)) throw new Error('Body holds text that cannot be stored')
  return body
}
