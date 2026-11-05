// Returns the path segments after /api/<resource>, e.g. /api/exams/5/results -> ['5', 'results'].
// vercel.json rewrites /api/<resource>/* to /api/<resource>?__path=*, so read that first
// and fall back to the pathname (vercel dev / direct hits).
// badQuery: a query value holds a NUL character, which Postgres refuses.
export function getSegments(req, resource) {
  const url = new URL(req.url, 'http://localhost')
  const fromQuery = url.searchParams.get('__path')
  const rest = fromQuery ?? url.pathname.replace(new RegExp(`^/api/${resource}/?`), '')
  const badQuery = [...url.searchParams.values()].some((value) => value.includes('\0'))
  return { url, segments: rest.split('/').filter(Boolean), badQuery }
}
