export function withPagination(data, total, page, perPage) {
  return {
    data,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage)
  }
}
