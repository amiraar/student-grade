import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export async function query(text, params) {
  return await sql(text, params)
}

export default sql
