import { json } from './response.js'

const buckets = globalThis.__rateLimitBuckets || new Map()
if (!globalThis.__rateLimitBuckets) {
  globalThis.__rateLimitBuckets = buckets
}

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

export function rateLimit(req, { key, limit, windowMs }) {
  const ip = getClientIp(req)
  const bucketKey = `${key}:${ip}`
  const now = Date.now()

  const entry = buckets.get(bucketKey)
  if (!entry || now > entry.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return null
  }

  entry.count += 1
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return json(
      { message: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }

  return null
}
