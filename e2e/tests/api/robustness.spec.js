// Bad input must get a clear 4xx from the API, not an unhandled 500.
//
// A test.fail line marks a group that fails today because of a confirmed bug, so the suite stays
// usable as a regression gate. Once fixed, the group reports "Expected to fail, but passed":
// remove its test.fail line.
import { test, expect } from '@playwright/test'
import { client, createClass, createExam, createStudent, newTeacher, parseCsv, scenario, STANDARD_KEY, STANDARD_WEIGHTS, uid } from '../helpers.js'

const KNOWN_BUG = 'Known bug, see the comment at the top of this file'

// Soft, so every case in a test is reported rather than only the first failure
const expect4xx = (res, label) => {
  expect.soft(res.status >= 400 && res.status < 500, `${label} -> ${res.status} ${res.text.slice(0, 120)}`).toBe(true)
}

const examBody = (classId, overrides = {}) => ({
  class_id: classId,
  title: 'T',
  subject: 'S',
  exam_date: '2026-01-01',
  answer_key: STANDARD_KEY,
  weights: STANDARD_WEIGHTS,
  ...overrides
})

test.describe('identifiers, filters and pagination', () => {
  test.fail(() => true, KNOWN_BUG)

  for (const [label, path] of [
    ['decimal id', '/classes/1.5'],
    ['id beyond integer range', '/classes/99999999999'],
    ['decimal student id', '/students/1.5'],
    ['decimal exam id', '/exams/1.5'],
    ['non-numeric semester filter', '/classes?semester=abc'],
    ['semester filter beyond its column', '/classes?semester=99999'],
    ['non-numeric class filter', '/students?class_id=abc'],
    ['non-numeric student semester filter', '/students?semester=abc'],
    ['non-numeric exam filter', '/exams?class_id=abc'],
    ['non-numeric report class', '/reports/export?class_id=abc'],
    ['non-numeric report semester', '/reports/export?semester=abc'],
    ['decimal per_page', '/classes?per_page=1.5'],
    ['decimal page', '/students?page=1.5&per_page=3'],
    ['enormous page', '/exams?page=1e30']
  ]) {
    test(label, async ({ request }) => {
      const { api } = await newTeacher(request)
      const res = await api.get(path)
      expect(res.status, `${path} -> ${res.status} ${res.text.slice(0, 120)}`).toBeLessThan(500)
    })
  }

  test('report filter with a non-numeric exam', async ({ request }) => {
    const { api, klass } = await scenario(request)
    const res = await api.get(`/classes/${klass.id}/report?exam_id=abc`)
    expect(res.status, `${res.status} ${res.text.slice(0, 120)}`).toBeLessThan(500)
  })

  test('student history with a non-numeric semester', async ({ request }) => {
    const { api, student } = await scenario(request)
    const res = await api.get(`/students/${student.id}/results?semester=abc`)
    expect(res.status, `${res.status} ${res.text.slice(0, 120)}`).toBeLessThan(500)
  })
})

test.describe('text the database cannot store', () => {
  test.fail(() => true, KNOWN_BUG)

  for (const path of ['/classes', '/students', '/exams']) {
    test(`NUL in the search of ${path}`, async ({ request }) => {
      const { api } = await newTeacher(request)
      const res = await api.get(`${path}?search=a%00b`)
      expect(res.status, `${res.status} ${res.text.slice(0, 120)}`).toBeLessThan(500)
    })
  }

  test('NUL and broken unicode in a JSON body', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect4xx(await api.post('/classes', { name: 'a\u0000b', academic_year: '2025/2026', semester: 1 }), 'NUL in name')
    expect4xx(await api.post('/classes', { name: 'a\ud800b', academic_year: '2025/2026', semester: 1 }), 'lone surrogate in name')
  })

  test('NUL in an email', async ({ request }) => {
    expect4xx(await client(request).post('/auth/login', { email: 'a\u0000@e2e.test', password: 'rahasia1' }), 'login')
    expect4xx(await client(request).post('/auth/register', { name: 'A', email: `a\u0000${uid()}@e2e.test`, password: 'rahasia1' }), 'register')
  })

  test('NUL inside answers and weights stored as JSON', async ({ request }) => {
    const { api, klass, exam, student } = await scenario(request)
    expect4xx(await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: [{ no: 1, jawaban: 'A\u0000' }] } }), 'jawaban')
    expect4xx(await api.post('/exams', examBody(klass.id, { weights: { ...STANDARD_WEIGHTS, note: 'x\u0000' } })), 'weights')
  })
})

test.describe('class and student fields', () => {
  test.fail(() => true, KNOWN_BUG)

  test('class: semester out of range', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    expect4xx(await api.post('/classes', { name: 'A', academic_year: '2025/2026', semester: 3 }), 'POST semester=3')
    expect4xx(await api.put(`/classes/${klass.id}`, { semester: 9 }), 'PUT semester=9')
  })

  test('class: text longer than the column', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    expect4xx(await api.post('/classes', { name: 'x'.repeat(101), academic_year: '2025/2026', semester: 1 }), 'POST long name')
    expect4xx(await api.post('/classes', { name: 'A', academic_year: 'x'.repeat(21), semester: 1 }), 'POST long year')
    expect4xx(await api.put(`/classes/${klass.id}`, { name: 'x'.repeat(101) }), 'PUT long name')
    expect4xx(await api.put(`/classes/${klass.id}`, { academic_year: 'x'.repeat(21) }), 'PUT long year')
  })

  test('class: text that is not text', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect4xx(await api.post('/classes', { name: { a: 1 }, academic_year: '2025/2026', semester: 1 }), 'name object')
  })

  test('student: text longer than the column', async ({ request }) => {
    const { api, klass, student } = await scenario(request)
    expect4xx(await api.post('/students', { class_id: klass.id, name: 'x'.repeat(256), nis: uid() }), 'POST long name')
    expect4xx(await api.post('/students', { class_id: klass.id, name: 'A', nis: 'x'.repeat(51) }), 'POST long NIS')
    expect4xx(await api.put(`/students/${student.id}`, { name: 'x'.repeat(256) }), 'PUT long name')
    expect4xx(await api.put(`/students/${student.id}`, { nis: 'x'.repeat(51) }), 'PUT long NIS')
  })

  test('student: non-numeric class_id', async ({ request }) => {
    const { api, student } = await scenario(request)
    expect4xx(await api.post('/students', { class_id: 'abc', name: 'A', nis: uid() }), 'POST class_id=abc')
    expect4xx(await api.put(`/students/${student.id}`, { class_id: 'abc' }), 'PUT class_id=abc')
  })

  test('student: changing NIS to one already used', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const first = await createStudent(api, klass.id)
    const second = await createStudent(api, klass.id)
    const res = await api.put(`/students/${second.id}`, { nis: first.nis })
    expect(res.status, res.text.slice(0, 120)).toBe(409)
  })
})

test.describe('exam fields', () => {
  test.fail(() => true, KNOWN_BUG)

  test('invalid date', async ({ request }) => {
    const { api, klass, exam } = await scenario(request)
    expect4xx(await api.post('/exams', examBody(klass.id, { exam_date: 'bukan-tanggal' })), 'POST bad date')
    expect4xx(await api.post('/exams', examBody(klass.id, { exam_date: '2026-02-30' })), 'POST impossible date')
    expect4xx(await api.put(`/exams/${exam.id}`, { exam_date: '2026-13-45' }), 'PUT bad date')
  })

  test('non-numeric class_id', async ({ request }) => {
    const { api } = await scenario(request)
    expect4xx(await api.post('/exams', examBody('abc')), 'POST class_id=abc')
  })

  test('text longer than the column', async ({ request }) => {
    const { api, klass, exam } = await scenario(request)
    expect4xx(await api.post('/exams', examBody(klass.id, { title: 'x'.repeat(256) })), 'POST long title')
    expect4xx(await api.post('/exams', examBody(klass.id, { subject: 'x'.repeat(256) })), 'POST long subject')
    expect4xx(await api.put(`/exams/${exam.id}`, { title: 'x'.repeat(256) }), 'PUT long title')
  })

  test('answer that is not a string', async ({ request }) => {
    const { api, klass } = await scenario(request)
    expect4xx(await api.post('/exams', examBody(klass.id, { answer_key: { pg: [{ no: 1, answer: 1 }] } })), 'POST answer=1')
  })

  test('answer key in the wrong shape', async ({ request }) => {
    const { api, klass, exam } = await scenario(request)
    expect4xx(await api.post('/exams', examBody(klass.id, { answer_key: { pg: 'ABC' } })), 'POST pg string')
    expect4xx(await api.post('/exams', examBody(klass.id, { answer_key: { pg: [null] } })), 'POST pg null item')
    expect4xx(await api.post('/exams', examBody(klass.id, { answer_key: { pg: [{ no: 'abc', answer: 'A' }] } })), 'POST bad number')
    expect4xx(await api.put(`/exams/${exam.id}`, { answer_key: { pg: 'ABC' } }), 'PUT pg string')
  })
})

test.describe('exam without questions', () => {
  test.fail(() => true, KNOWN_BUG)

  test('answer key without any question', async ({ request }) => {
    const { api, klass, exam } = await scenario(request)
    expect4xx(await api.post('/exams', examBody(klass.id, { answer_key: { pg: [], bs: [], mj: [] } })), 'POST empty key')
    expect4xx(await api.put(`/exams/${exam.id}`, { answer_key: { pg: [], bs: [], mj: [] } }), 'PUT empty key')
    expect((await api.get(`/exams/${exam.id}`)).body.answer_key).toEqual(exam.answer_key)
  })
})

test.describe('grading input', () => {
  test.fail(() => true, KNOWN_BUG)

  test('answers in the wrong shape', async ({ request }) => {
    const { api, exam, student } = await scenario(request)
    const grade = (answers) => api.post('/grade', { exam_id: exam.id, student_id: student.id, answers })
    expect4xx(await grade({ pg: 'ABC' }), 'answers.pg string')
    expect4xx(await grade({ pg: [null] }), 'answers.pg null item')
    expect4xx(await grade(['A']), 'answers array')
  })

  test('identifiers that are not whole numbers', async ({ request }) => {
    const { api, exam, student } = await scenario(request)
    const answers = { pg: [{ no: 1, jawaban: 'A' }] }
    expect4xx(await api.post('/grade', { exam_id: 1.5, student_id: student.id, answers }), 'exam_id=1.5')
    expect4xx(await api.post('/grade', { exam_id: exam.id, student_id: 99999999999, answers }), 'student_id too large')
  })

  test('image that is not text gets a clear message', async ({ request }) => {
    const { api, exam, student } = await scenario(request)
    const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, image: 123 })
    expect4xx(res, 'image=123')
    expect(res.body?.message).not.toMatch(/is not a function/)
  })

  test('AI reply in the wrong shape is reported and nothing is saved', async ({ request }) => {
    const { api, exam, student } = await scenario(request)
    const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, image: 'E2E_BAD_SHAPE' })
    expect4xx(res, 'AI pg string')
    expect((await api.get(`/exams/${exam.id}/results`)).body.data).toEqual([])
  })
})

test.describe('student import', () => {
  test.fail(() => true, KNOWN_BUG)

  test('csv that is not text', async ({ request }) => {
    const { api, klass } = await scenario(request)
    expect4xx(await api.post('/students/import', { class_id: klass.id, csv: 123 }), 'csv=123')
  })

  test('class_id beyond integer range', async ({ request }) => {
    const { api } = await scenario(request)
    expect4xx(await api.post('/students/import', { class_id: 99999999999, csv: `Nama;NIS\nA;${uid()}\n` }), 'class_id too large')
  })

  test('rows too long for the columns are skipped, the others are added', async ({ request }) => {
    const { api, klass } = await scenario(request)
    const csv = `Nama;NIS\n${'x'.repeat(256)};${uid()}\nA;${'x'.repeat(51)}\nBaik;${uid()}\n`
    const res = await api.post('/students/import', { class_id: klass.id, csv })
    expect(res.status, res.text.slice(0, 120)).toBe(200)
    expect(res.body).toMatchObject({ inserted: 1, skipped: 2 })
  })
})

test.describe('auth input', () => {
  test.fail(() => true, KNOWN_BUG)

  test('password that is not text', async ({ request }) => {
    const teacher = await newTeacher(request)
    expect4xx(await client(request).post('/auth/login', { email: teacher.email, password: 123456 }), 'login password=123456')
    expect4xx(await client(request).post('/auth/register', { name: 'A', email: `${uid()}@e2e.test`, password: 123456 }), 'register password=123456')
  })

  test('email that is not an email address', async ({ request }) => {
    expect4xx(await client(request).post('/auth/register', { name: 'A', email: `bukan-email-${uid()}`, password: 'rahasia1' }), 'register email')
  })

  test('text longer than the column', async ({ request }) => {
    expect4xx(await client(request).post('/auth/register', { name: 'x'.repeat(256), email: `${uid()}@e2e.test`, password: 'rahasia1' }), 'long name')
    expect4xx(await client(request).post('/auth/register', { name: 'A', email: `${'x'.repeat(250)}@e2e.test`, password: 'rahasia1' }), 'long email')
  })
})

test.describe('CSV exports', () => {
  test.fail(() => true, KNOWN_BUG)

  test('a name starting with a formula character cannot run in a spreadsheet', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    await createStudent(api, klass.id, { name: '=HYPERLINK("http://evil.example","klik")' })
    await createExam(api, klass.id)
    const res = await api.get(`/reports/export?class_id=${klass.id}`)
    const cell = parseCsv(res.text)[1][0].replace(/^"/, '')
    expect(cell.startsWith('=')).toBe(false)
  })
})

test.describe('between teachers', () => {
  test.fail(() => true, KNOWN_BUG)

  test('two teachers can use the same NIS in their own classes', async ({ request }) => {
    const a = await newTeacher(request)
    const b = await newTeacher(request)
    const nis = `NIS-${uid()}`
    await createStudent(a.api, (await createClass(a.api)).id, { nis })
    const res = await b.api.post('/students', { class_id: (await createClass(b.api)).id, name: 'Siswa B', nis })
    expect(res.status, `${res.status} ${res.text.slice(0, 120)}`).toBe(201)
  })

  test('import keeps NIS separate per teacher too', async ({ request }) => {
    const a = await newTeacher(request)
    const b = await newTeacher(request)
    const nis = `NIS-${uid()}`
    await createStudent(a.api, (await createClass(a.api)).id, { nis })
    const res = await b.api.post('/students/import', { class_id: (await createClass(b.api)).id, csv: `Nama;NIS\nSiswa B;${nis}\n` })
    expect(res.body).toMatchObject({ inserted: 1, skipped: 0 })
  })
})
