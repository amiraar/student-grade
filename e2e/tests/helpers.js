import { randomBytes, randomInt } from 'node:crypto'

export const uid = () => randomBytes(5).toString('hex')

// Rate limits are per IP, so each test uses its own address.
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`

export const STANDARD_KEY = {
  pg: ['A', 'B', 'C', 'D', 'E'].map((answer, i) => ({ no: i + 1, answer })),
  bs: ['B', 'S'].map((answer, i) => ({ no: i + 1, answer })),
  mj: ['A', 'B'].map((answer, i) => ({ no: i + 1, answer }))
}
export const STANDARD_WEIGHTS = { pg: 70, bs: 20, mj: 10 }

export const answers = (section) => section.split('').map((jawaban, i) => ({ no: i + 1, jawaban }))

// API client bound to one teacher: api.post('/classes', {...}) -> { status, body, headers, text }
export function client(request, token, ip = randomIp()) {
  const call = async (method, path, data, extraHeaders = {}) => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: {
        'X-Forwarded-For': ip,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders
      }
    })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    return { status: response.status(), headers: response.headers(), text, body }
  }
  return {
    get: (path, extra) => call('GET', path, undefined, extra),
    post: (path, data, extra) => call('POST', path, data, extra),
    put: (path, data, extra) => call('PUT', path, data, extra),
    delete: (path, extra) => call('DELETE', path, undefined, extra)
  }
}

export async function newTeacher(request) {
  const ip = randomIp()
  const email = `guru-${uid()}@e2e.test`
  const password = `pw-${uid()}`
  const res = await client(request, null, ip).post('/auth/register', { name: `Guru ${uid()}`, email, password })
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.text}`)
  return { api: client(request, res.body.token, ip), user: res.body.user, token: res.body.token, email, password, ip }
}

async function created(promise, what) {
  const res = await promise
  if (res.status !== 201) throw new Error(`${what} failed: ${res.status} ${res.text}`)
  return res.body
}

export const createClass = (api, overrides = {}) =>
  created(api.post('/classes', { name: `Kelas ${uid()}`, academic_year: '2025/2026', semester: 1, ...overrides }), 'create class')

export const createStudent = (api, classId, overrides = {}) =>
  created(api.post('/students', { class_id: classId, name: `Siswa ${uid()}`, nis: `NIS-${uid()}`, ...overrides }), 'create student')

export const createExam = (api, classId, overrides = {}) =>
  created(
    api.post('/exams', {
      class_id: classId,
      title: `Ujian ${uid()}`,
      subject: 'Matematika',
      exam_date: '2026-03-15',
      answer_key: STANDARD_KEY,
      weights: STANDARD_WEIGHTS,
      ...overrides
    }),
    'create exam'
  )

// Class + student + exam owned by one teacher
export async function scenario(request) {
  const teacher = await newTeacher(request)
  const klass = await createClass(teacher.api)
  const student = await createStudent(teacher.api, klass.id)
  const exam = await createExam(teacher.api, klass.id)
  return { ...teacher, klass, student, exam }
}

// Strips the BOM and splits into rows of cells
export const parseCsv = (text) =>
  text
    .replace(/^﻿/, '')
    .split('\n')
    .map((row) => row.split(';'))
