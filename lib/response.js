const corsOrigin = process.env.CORS_ORIGIN || '*'

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    ...extra
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(),
      ...headers
    }
  })
}

export function error(message, status = 400, headers = {}) {
  return json({ message }, status, headers)
}
