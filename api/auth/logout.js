import { json } from '../../lib/response.js'

export const config = { runtime: 'nodejs22.x' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405)
  }
  return json({ message: 'Logout berhasil' })
}
