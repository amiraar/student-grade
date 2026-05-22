import { json } from './response.js'

// In-memory fallback (best-effort in serverless — not shared across instances)
const buckets = globalThis.__rateLimitBuckets || new Map()
if (!globalThis.__rateLimitBuckets) globalThis.__rateLimitBuckets = buckets

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

async function rateLimitUpstash(req, { key, limit, windowMs }) {
  try {
    const { Redis } = await import('@upstash/redis')
    const { Ratelimit } = await import('@upstash/ratelimit')
    const redis = Redis.fromEnv()
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs}ms`),
      prefix: 'rl'
    })
    const ip = getClientIp(req)
    const { success, reset } = await ratelimit.limit(`${key}:${ip}`)
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000)
      return json({ message: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429, {
        'Retry-After': String(retryAfter)
      })
    }
    return null
  } catch {
    return null // fail open if Upstash unavailable
  }
}

function rateLimitMemory(req, { key, limit, windowMs }) {
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
    return json({ message: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429, {
      'Retry-After': String(retryAfter)
    })
  }
  return null
}

export async function rateLimit(req, opts) {
  if (process.env.UPSTASH_REDIS_URL) {
    return rateLimitUpstash(req, opts)
  }
  return rateLimitMemory(req, opts)
}
