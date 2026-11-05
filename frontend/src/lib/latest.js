// Responses can arrive out of order on a slow connection. Call the returned function at the start
// of each request; what it returns tells whether that request is still the newest one:
//
//   const track = latestRequest()
//   const load = async () => {
//     const isNewest = track()
//     const res = await api.get(...)
//     if (!isNewest()) return
//     ...
//   }
export function latestRequest() {
  let newest = 0
  return () => {
    const id = ++newest
    return () => id === newest
  }
}
