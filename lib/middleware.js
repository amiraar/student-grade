import { verifyToken } from './auth.js'
import { json } from './response.js'

export async function requireAuth(req) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: json({ message: 'Unauthorized' }, 401), user: null }
  }
  try {
    const token = authHeader.slice(7)
    const user = await verifyToken(token)
    return { error: null, user }
  } catch {
    return { error: json({ message: 'Token tidak valid' }, 401), user: null }
  }
}
