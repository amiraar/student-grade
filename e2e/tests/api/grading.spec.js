import { test, expect } from '@playwright/test'
import { STANDARD_WEIGHTS, answers, client, createClass, createExam, createStudent, newTeacher, parseCsv, randomIp, scenario } from '../helpers.js'

const grade = (ctx, sheet, extra = {}) => ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.student.id, answers: sheet, ...extra })

test.describe('grading with manual or template answers', () => {
  test('score matches a hand calculation', async ({ request }) => {
    const ctx = await scenario(request)
    // Key: PG ABCDE, B/S BS, MJ AB. Weights 70/20/10.
    // PG 4/5 x 70 = 56, B/S 1/2 x 20 = 10, MJ 2/2 x 10 = 10 -> 76, grade C
    const res = await grade(ctx, { pg: answers('ABCDA'), bs: answers('BB'), mj: answers('AB') })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      score: 76,
      grade: 'C',
      sheet_quality: 'manual',
      detail: {
        pg: { correct: 4, wrong: 1, empty: 0, double: 0 },
        bs: { correct: 1, wrong: 1, empty: 0, double: 0 },
        mj: { correct: 2, wrong: 0, empty: 0, double: 0 }
      }
    })
    expect(res.body.result_id).toBeTruthy()
    expect(res.body.items.pg[4]).toEqual({ no: 5, key: 'E', answer: 'A', status: 'wrong' })
  })

  test('empty, double and missing answers are counted and earn nothing', async ({ request }) => {
    const ctx = await scenario(request)
    const res = await grade(ctx, {
      pg: [{ no: 1, jawaban: '-' }, { no: 2, jawaban: '!!' }, { no: 3, jawaban: 'C' }],
      bs: [],
      mj: []
    })
    // PG 1/5 x 70 = 14
    expect(res.body.score).toBe(14)
    expect(res.body.grade).toBe('E')
    expect(res.body.detail.pg).toEqual({ correct: 1, wrong: 0, empty: 3, double: 1 })
    expect(res.body.detail.bs.empty).toBe(2)
    expect(res.body.detail.mj.empty).toBe(2)
  })

  test('lowercase answers with spaces count as correct', async ({ request }) => {
    const ctx = await scenario(request)
    const res = await grade(ctx, { pg: [{ no: 1, jawaban: ' a ' }, { no: 2, jawaban: 'b' }] })
    expect(res.body.detail.pg.correct).toBe(2)
  })

  for (const [expected, sheet] of [
    ['A', { pg: 'ABCDE', bs: 'BS', mj: 'AB' }], // 100
    ['B', { pg: 'ABCDA', bs: 'BS', mj: 'AB' }], // 86
    ['C', { pg: 'ABCDA', bs: 'BB', mj: 'AB' }], // 76
    ['D', { pg: 'ABCAA', bs: 'BS', mj: 'BA' }], // 42 + 20 = 62
    ['E', { pg: 'BBBBB', bs: 'SB', mj: 'BA' }] // 14
  ]) {
    test(`grade boundary example: ${expected}`, async ({ request }) => {
      const ctx = await scenario(request)
      const res = await grade(ctx, { pg: answers(sheet.pg), bs: answers(sheet.bs), mj: answers(sheet.mj) })
      expect(res.body.grade).toBe(expected)
    })
  }

  test('sections without a key pass their weight to the others', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: [{ no: 1, answer: 'A' }, { no: 2, answer: 'B' }], bs: [], mj: [] },
      weights: STANDARD_WEIGHTS
    })
    const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('AA') } })
    expect(res.body.score).toBe(50)
  })

  test('conversion table decides the score, keeping decimals', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: [{ no: 1, answer: 'A' }, { no: 2, answer: 'B' }, { no: 3, answer: 'C' }], bs: [], mj: [] },
      weights: { ...STANDARD_WEIGHTS, table: [0, 33.33, 71.5, 100] }
    })
    const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABA') } })
    expect(res.body.score).toBe(71.5)
    expect(res.body.grade).toBe('C')
    const saved = (await api.get(`/exams/${exam.id}/results`)).body.data[0]
    expect(Number(saved.score)).toBe(71.5)
  })

  test('grading again replaces the saved result', async ({ request }) => {
    const ctx = await scenario(request)
    await grade(ctx, { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') })
    await grade(ctx, { pg: answers('ABCDA'), bs: answers('BS'), mj: answers('AB') }, { source: 'template' })
    const res = await ctx.api.get(`/exams/${ctx.exam.id}/results`)
    expect(res.body.total).toBe(1)
    expect(Number(res.body.data[0].score)).toBe(86)
    expect(res.body.data[0].sheet_quality).toBe('template')
  })

  test('input validation', async ({ request }) => {
    const ctx = await scenario(request)
    const { api, exam, student } = ctx
    expect((await api.post('/grade', { student_id: student.id, answers: {} })).status).toBe(400)
    expect((await api.post('/grade', { exam_id: exam.id, answers: {} })).status).toBe(400)
    expect((await api.post('/grade', { exam_id: exam.id, student_id: student.id })).status).toBe(400)
    expect((await api.post('/grade', { exam_id: 999999, student_id: student.id, answers: {} })).status).toBe(404)
    expect((await api.get('/grade')).status).toBe(405)
  })

  test('a student from another class cannot be graded on this exam', async ({ request }) => {
    const ctx = await scenario(request)
    const otherClass = await createClass(ctx.api)
    const outsider = await createStudent(ctx.api, otherClass.id)
    const res = await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: outsider.id, answers: {} })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Siswa tidak ditemukan di kelas ujian ini')
  })

  test('is rate limited after 120 requests per minute per IP', async ({ request }) => {
    test.setTimeout(120_000)
    const ctx = await scenario(request)
    const api = client(request, ctx.token, randomIp())
    const responses = await Promise.all(Array.from({ length: 121 }, () => api.post('/grade', {})))
    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s === 400)).toHaveLength(120)
    expect(statuses.filter((s) => s === 429)).toHaveLength(1)
  })
})

// Gemini itself is stubbed by the harness: this covers our handling of its replies, not the model.
test.describe('grading with AI (stubbed Gemini)', () => {
  const key3 = { pg: [{ no: 1, answer: 'A' }, { no: 2, answer: 'B' }, { no: 3, answer: 'C' }], bs: [], mj: [] }

  async function aiScenario(request) {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, { answer_key: key3 })
    return { api, klass, student, exam }
  }

  test('scores what the AI read and stores the sheet quality', async ({ request }) => {
    const { api, student, exam } = await aiScenario(request)
    const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, image: 'ZmFrZQ==' })
    // Stub reads A, B, E: 2 of 3 -> 67
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ score: 67, grade: 'D', sheet_quality: 'good' })
    expect((await api.get(`/exams/${exam.id}/results`)).body.total).toBe(1)
  })

  for (const [image, message] of [
    ['E2E_HTTP_500', 'Layanan AI gagal (500): stub failure'],
    ['E2E_GARBAGE', 'Hasil AI tidak bisa dibaca. Coba foto ulang.'],
    ['E2E_UNREADABLE', 'Foto tidak bisa dibaca (blurry). Foto ulang dengan cahaya cukup dan kertas rata.']
  ]) {
    test(`failure is reported and nothing is saved: ${image}`, async ({ request }) => {
      const { api, student, exam } = await aiScenario(request)
      const res = await api.post('/grade', { exam_id: exam.id, student_id: student.id, image })
      expect(res.status).toBe(422)
      expect(res.body.message).toBe(message)
      expect((await api.get(`/exams/${exam.id}/results`)).body.total).toBe(0)
    })
  }
})

test.describe('CSV exports', () => {
  test('exam results: exact content, BOM, headers, decimal comma, highest first', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api, { name: 'X; IPA' })
    const low = await createStudent(api, klass.id, { name: 'Rendah', nis: `N-${Date.now()}-L` })
    const high = await createStudent(api, klass.id, { name: 'Tinggi "Ace"', nis: `N-${Date.now()}-H` })
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: [{ no: 1, answer: 'A' }, { no: 2, answer: 'B' }, { no: 3, answer: 'C' }], bs: [{ no: 1, answer: 'B' }], mj: [] },
      weights: { ...STANDARD_WEIGHTS, table: [0, 12.5, 33.33, 66.67, 100] }
    })
    await api.post('/grade', { exam_id: exam.id, student_id: low.id, answers: { pg: answers('A-!') } })
    await api.post('/grade', { exam_id: exam.id, student_id: high.id, answers: { pg: answers('ABA'), bs: answers('B') } })

    const res = await api.get(`/exams/${exam.id}/results/export`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe('attachment; filename="hasil-ujian.csv"')
    expect(res.text.charCodeAt(0)).toBe(0xfeff)

    const lines = res.text.replace(/^﻿/, '').split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Nama Siswa;NIS;Kelas;Nilai;Grade;PG Benar;PG Salah;PG Kosong;PG Double;BS Benar;BS Salah;BS Kosong;BS Double;MJ Benar;MJ Salah;MJ Kosong;MJ Double;Tanggal Koreksi (UTC)')
    // High: 3 correct -> 66.67; quotes and the delimiter inside the class name are escaped
    expect(lines[1]).toMatch(new RegExp(`^"Tinggi ""Ace""";${high.nis};"X; IPA";66,67;D;2;1;0;0;1;0;0;0;0;0;0;0;\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$`))
    // Low: 1 correct -> 12.5; "-" empty, "!" is an unknown mark counted wrong
    expect(lines[2]).toMatch(new RegExp(`^Rendah;${low.nis};"X; IPA";12,5;E;1;1;1;0;0;0;1;0;0;0;0;0;`))
  })

  test('class report: scores per exam and average', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const graded = await createStudent(api, klass.id, { name: 'A Dinilai' })
    const ungraded = await createStudent(api, klass.id, { name: 'B Belum' })
    const first = await createExam(api, klass.id, { title: 'Ujian 1', exam_date: '2026-01-10' })
    const second = await createExam(api, klass.id, { title: 'Ujian 2', exam_date: '2026-02-10' })
    await api.post('/grade', { exam_id: first.id, student_id: graded.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } }) // 100
    await api.post('/grade', { exam_id: second.id, student_id: graded.id, answers: { pg: answers('ABCDA'), bs: answers('BB'), mj: answers('AA') } }) // 71

    const res = await api.get(`/reports/export?class_id=${klass.id}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="laporan-kelas.csv"')
    expect(parseCsv(res.text)).toEqual([
      ['Nama Siswa', 'NIS', 'Ujian 1', 'Ujian 2', 'Rata-rata'],
      ['A Dinilai', graded.nis, '100', '71', '85,5'],
      ['B Belum', ungraded.nis, '', '', '']
    ])
  })

  test('report over several classes adds a class column; filters apply', async ({ request }) => {
    const { api } = await newTeacher(request)
    const a = await createClass(api, { name: 'Kelas A', semester: 1, academic_year: '2024/2025' })
    const b = await createClass(api, { name: 'Kelas B', semester: 2, academic_year: '2024/2025' })
    const sa = await createStudent(api, a.id, { name: 'Ana' })
    const sb = await createStudent(api, b.id, { name: 'Bob' })

    expect(parseCsv((await api.get('/reports/export')).text)).toEqual([
      ['Nama Siswa', 'NIS', 'Kelas', 'Rata-rata'],
      ['Ana', sa.nis, 'Kelas A', ''],
      ['Bob', sb.nis, 'Kelas B', '']
    ])
    expect(parseCsv((await api.get('/reports/export?semester=2')).text)).toEqual([
      ['Nama Siswa', 'NIS', 'Rata-rata'],
      ['Bob', sb.nis, '']
    ])
    const none = await api.get('/reports/export?semester=1&academic_year=1999')
    expect(none.status).toBe(404)
    expect(none.body.message).toBe('Kelas tidak ditemukan')
    expect((await api.get('/reports/unknown')).status).toBe(404)
  })
})
