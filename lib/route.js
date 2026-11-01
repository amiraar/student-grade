// Returns the path segments after /api/<resource>, e.g. /api/exams/5/results -> ['5', 'results'].
// vercel.json rewrites /api/<resource>/* to /api/<resource>?__path=*, so read that first
// and fall back to the pathname (vercel dev / direct hits).
export function getSegments(req, resource) {
  const url = new URL(req.url, 'http://localhost')
  const fromQuery = url.searchParams.get('__path')
  const rest = fromQuery ?? url.pathname.replace(new RegExp(`^/api/${resource}/?`), '')
  return { url, segments: rest.split('/').filter(Boolean) }
}
