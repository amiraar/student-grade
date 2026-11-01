import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // A wrong password on login/register also returns 401; let the page show that message
    const isAuthForm = /\/auth\/(login|register)$/.test(err.config?.url || '')
    if (err.response?.status === 401 && !isAuthForm) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const errorMessage = (err, fallback = 'Terjadi kesalahan.') => err.response?.data?.message || fallback

// File downloads must go through axios so the Authorization header is sent
export async function downloadFile(path, filename, params) {
  let res
  try {
    res = await api.get(path, { params, responseType: 'blob' })
  } catch (err) {
    // With responseType 'blob' the JSON error body arrives as a Blob
    const text = await err.response?.data?.text?.().catch(() => '')
    try {
      err.response.data = JSON.parse(text)
    } catch {
      // not JSON, keep as is
    }
    throw err
  }
  const url = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default api
