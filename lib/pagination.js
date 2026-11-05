const positiveInt = (value, fallback) => {
  const number = Math.trunc(Number(value))
  return number && Number.isSafeInteger(number) ? Math.max(number, 1) : fallback
}

export function getPagination(params, defaults = { page: 1, perPage: 20 }) {
  const page = positiveInt(params.get('page'), defaults.page)
  const perPage = Math.min(positiveInt(params.get('per_page'), defaults.perPage), 200)
  const offset = (page - 1) * perPage
  return { page, perPage, offset }
}
