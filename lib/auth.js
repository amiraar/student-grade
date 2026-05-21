import { SignJWT, jwtVerify } from 'jose'

const issuer = process.env.JWT_ISSUER || 'student-grade'
const audience = process.env.JWT_AUDIENCE || 'student-grade-web'

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET belum diset')
  }
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, getSecret(), { issuer, audience })
  return payload
}
