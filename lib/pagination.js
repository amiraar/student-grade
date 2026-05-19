export function getPagination(params, defaults = { page: 1, perPage: 20 }) {
  const page = Math.max(Number(params.get('page')) || defaults.page, 1)
  const perPage = Math.min(Math.max(Number(params.get('per_page')) || defaults.perPage, 1), 200)
  const offset = (page - 1) * perPage
  return { page, perPage, offset }
}
