import { test, expect } from '@playwright/test'
import { STANDARD_KEY, STANDARD_WEIGHTS, answers, createClass, createExam, createStudent, newTeacher, scenario, uid } from '../helpers.js'

test.describe('classes', () => {
  test('create, read, update, delete', async ({ request }) => {
    const { api } = await newTeacher(request)
    const created = await api.post('/classes', { name: 'XI IPA', academic_year: '2025/2026', semester: 2 })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ name: 'XI IPA', academic_year: '2025/2026', semester: 2 })

    const id = created.body.id
    expect((await api.get(`/classes/${id}`)).body.name).toBe('XI IPA')

    const updated = await api.put(`/classes/${id}`, { name: 'XI IPS' })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ name: 'XI IPS', academic_year: '2025/2026', semester: 2 })

    expect((await api.delete(`/classes/${id}`)).status).toBe(200)
    expect((await api.get(`/classes/${id}`)).status).toBe(404)
  })

  test('requires name, year and semester', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect((await api.post('/classes', { academic_year: '2025/2026', semester: 1 })).status).toBe(400)
    expect((await api.post('/classes', { name: 'A', semester: 1 })).status).toBe(400)
    expect((await api.post('/classes', { name: 'A', academic_year: '2025/2026' })).status).toBe(400)
  })

  test('search, filters, sorting and pagination', async ({ request }) => {
    const { api } = await newTeacher(request)
    await createClass(api, { name: 'Alfa', semester: 1, academic_year: '2024/2025' })
    await createClass(api, { name: 'Beta', semester: 2, academic_year: '2024/2025' })
    await createClass(api, { name: 'Gamma', semester: 1, academic_year: '2025/2026' })

    const names = (res) => res.body.data.map((c) => c.name)
    expect(names(await api.get('/classes?search=ALF'))).toEqual(['Alfa'])
    expect(names(await api.get('/classes?semester=2'))).toEqual(['Beta'])
    expect(names(await api.get(`/classes?academic_year=${encodeURIComponent('2025/2026')}`))).toEqual(['Gamma'])
    expect(names(await api.get('/classes?sort=name&order=asc'))).toEqual(['Alfa', 'Beta', 'Gamma'])
    expect(names(await api.get('/classes?sort=name&order=desc'))).toEqual(['Gamma', 'Beta', 'Alfa'])

    const page = await api.get('/classes?sort=name&order=asc&per_page=2&page=2')
    expect(page.body).toMatchObject({ total: 3, page: 2, per_page: 2, total_pages: 2 })
    expect(names(page)).toEqual(['Gamma'])
    expect((await api.get('/classes?per_page=99999')).body.per_page).toBe(200)
  })

  test('SQL injection through search and sort has no effect', async ({ request }) => {
    const { api } = await newTeacher(request)
    await createClass(api, { name: 'Aman' })
    const search = await api.get(`/classes?search=${encodeURIComponent("' OR 1=1 --")}`)
    expect(search.status).toBe(200)
    expect(search.body.data).toEqual([])
    const sort = await api.get(`/classes?sort=${encodeURIComponent('name; DROP TABLE classes;--')}`)
    expect(sort.status).toBe(200)
    expect(sort.body.data).toHaveLength(1)
    const quoted = await createClass(api, { name: "Kelas O'Brien" })
    expect(quoted.name).toBe("Kelas O'Brien")
  })

  test('non-numeric id gives 400, unknown id gives 404', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect((await api.get('/classes/abc')).status).toBe(400)
    expect((await api.get('/classes/999999')).status).toBe(404)
  })

  test('deleting a class removes its students, exams and results', async ({ request }) => {
    const { api, klass, student, exam } = await scenario(request)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE') } })
    expect((await api.delete(`/classes/${klass.id}`)).status).toBe(200)
    expect((await api.get(`/students/${student.id}`)).status).toBe(404)
    expect((await api.get(`/exams/${exam.id}`)).status).toBe(404)
    expect((await api.get('/exams')).body.total).toBe(0)
  })

  test('class students list shows the latest score, report shows the average', async ({ request }) => {
    const { api, klass, student, exam } = await scenario(request)
    const second = await createExam(api, klass.id)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    await api.post('/grade', { exam_id: second.id, student_id: student.id, answers: { pg: answers('ABCDA'), bs: answers('BS'), mj: answers('AB') } })

    const list = await api.get(`/classes/${klass.id}/students`)
    expect(Number(list.body.data[0].latest_score)).toBe(86)

    const report = await api.get(`/classes/${klass.id}/report`)
    expect(Number(report.body.data[0].average_score)).toBe(93)

    const perExam = await api.get(`/classes/${klass.id}/report?exam_id=${exam.id}`)
    expect(Number(perExam.body.data[0].average_score)).toBe(100)
  })
})

test.describe('students', () => {
  test('create, read, update, delete', async ({ request }) => {
    const { api } = await newTeacher(request)
    const a = await createClass(api)
    const b = await createClass(api)
    const nis = `NIS-${uid()}`
    const created = await api.post('/students', { class_id: a.id, name: 'Rina', nis })
    expect(created.status).toBe(201)

    const id = created.body.id
    const read = await api.get(`/students/${id}`)
    expect(read.body).toMatchObject({ name: 'Rina', nis, class_name: a.name })

    const moved = await api.put(`/students/${id}`, { class_id: b.id, name: 'Rina W' })
    expect(moved.body).toMatchObject({ name: 'Rina W', nis, class_id: b.id })

    expect((await api.delete(`/students/${id}`)).status).toBe(200)
    expect((await api.get(`/students/${id}`)).status).toBe(404)
  })

  test('requires class, name and NIS; class must exist', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    expect((await api.post('/students', { name: 'A', nis: uid() })).status).toBe(400)
    expect((await api.post('/students', { class_id: klass.id, nis: uid() })).status).toBe(400)
    expect((await api.post('/students', { class_id: klass.id, name: 'A' })).status).toBe(400)
    expect((await api.post('/students', { class_id: 999999, name: 'A', nis: uid() })).status).toBe(404)
  })

  test('a duplicate NIS is refused with a clear message', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const nis = `NIS-${uid()}`
    await createStudent(api, klass.id, { nis })
    const dup = await api.post('/students', { class_id: klass.id, name: 'Lain', nis })
    expect(dup.status).toBe(409)
    expect(dup.body.message).toBe('NIS sudah terdaftar')
  })

  test('search and filters', async ({ request }) => {
    const { api } = await newTeacher(request)
    const a = await createClass(api, { academic_year: '2024/2025', semester: 1 })
    const b = await createClass(api, { academic_year: '2025/2026', semester: 2 })
    const nis = `CARI-${uid()}`
    await createStudent(api, a.id, { name: 'Andi', nis })
    await createStudent(api, b.id, { name: 'Budi' })

    const names = (res) => res.body.data.map((s) => s.name)
    expect(names(await api.get('/students?search=andi'))).toEqual(['Andi'])
    expect(names(await api.get(`/students?search=${nis.toLowerCase()}`))).toEqual(['Andi'])
    expect(names(await api.get(`/students?class_id=${b.id}`))).toEqual(['Budi'])
    expect(names(await api.get('/students?semester=2'))).toEqual(['Budi'])
    expect(names(await api.get(`/students?academic_year=${encodeURIComponent('2024/2025')}`))).toEqual(['Andi'])
    expect(names(await api.get('/students?sort=name&order=asc'))).toEqual(['Andi', 'Budi'])
  })

  test('import: semicolon CSV with header', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const [n1, n2] = [`IMP-${uid()}`, `IMP-${uid()}`]
    const res = await api.post('/students/import', { class_id: klass.id, csv: `Nama;NIS\nSiti;${n1}\nJoko;${n2}\n` })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ inserted: 2, skipped: 0 })
    expect((await api.get(`/students?class_id=${klass.id}&sort=name&order=asc`)).body.data.map((s) => s.name)).toEqual(['Joko', 'Siti'])
  })

  test('import: comma CSV without header, quoted names, CRLF', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const [n1, n2] = [`IMP-${uid()}`, `IMP-${uid()}`]
    const res = await api.post('/students/import', { class_id: klass.id, csv: `"Santoso, Budi",${n1}\r\nAni,${n2}\r\n` })
    expect(res.body).toMatchObject({ inserted: 2, skipped: 0 })
    expect((await api.get(`/students?search=santoso`)).body.data[0].name).toBe('Santoso, Budi')
  })

  test('import: base64 file with a BOM, as sent by the upload field', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const nis = `IMP-${uid()}`
    const csv = Buffer.from(`﻿Nama;NIS\nDewi;${nis}\n`, 'utf8').toString('base64')
    const res = await api.post('/students/import', { class_id: klass.id, csv })
    expect(res.body).toMatchObject({ inserted: 1, skipped: 0 })
    expect((await api.get(`/students?search=${nis}`)).body.data[0].name).toBe('Dewi')
  })

  test('import: existing NIS and incomplete rows are skipped and counted', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const nis = `IMP-${uid()}`
    await createStudent(api, klass.id, { nis })
    const fresh = `IMP-${uid()}`
    const res = await api.post('/students/import', { class_id: klass.id, csv: `Nama;NIS\nLama;${nis}\nBaru;${fresh}\nTanpaNis;\n` })
    expect(res.body).toMatchObject({ inserted: 1, skipped: 2 })
  })

  test('import: requires csv content and a class', async ({ request }) => {
    const { api } = await newTeacher(request)
    expect((await api.post('/students/import', { class_id: 1 })).status).toBe(400)
    expect((await api.post('/students/import', { csv: `Nama;NIS\nA;${uid()}` })).status).toBe(400)
  })

  test('result history lists graded exams', async ({ request }) => {
    const { api, student, exam } = await scenario(request)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    const res = await api.get(`/students/${student.id}/results`)
    expect(res.body.total).toBe(1)
    expect(res.body.data[0]).toMatchObject({ exam_id: exam.id, exam_title: exam.title, subject: exam.subject, exam_date: '2026-03-15', grade: 'A' })
  })
})

test.describe('exams', () => {
  test('create, read, update, delete', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const created = await api.post('/exams', { class_id: klass.id, title: 'UTS', subject: 'Fisika', exam_date: '2026-01-31', answer_key: STANDARD_KEY, weights: STANDARD_WEIGHTS })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ title: 'UTS', subject: 'Fisika', answer_key: STANDARD_KEY, weights: STANDARD_WEIGHTS })

    const id = created.body.id
    expect((await api.get('/exams')).body.data[0].class_name).toBe(klass.name)

    const updated = await api.put(`/exams/${id}`, { title: 'UAS' })
    expect(updated.body).toMatchObject({ title: 'UAS', subject: 'Fisika', regraded: 0 })

    expect((await api.delete(`/exams/${id}`)).status).toBe(200)
    expect((await api.get(`/exams/${id}`)).status).toBe(404)
  })

  test('exam_date stays the same calendar day through create and update', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const created = await createExam(api, klass.id, { exam_date: '2026-01-01' })
    expect(created.exam_date).toBe('2026-01-01')
    expect((await api.get(`/exams/${created.id}`)).body.exam_date).toBe('2026-01-01')
    expect((await api.get(`/exams?class_id=${klass.id}`)).body.data[0].exam_date).toBe('2026-01-01')
    const updated = await api.put(`/exams/${created.id}`, { title: 'Baru' })
    expect(updated.body.exam_date).toBe('2026-01-01')
  })

  test('lowercase answer keys are stored uppercase', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const exam = await createExam(api, klass.id, { answer_key: { pg: [{ no: 1, answer: 'c' }], bs: [{ no: 1, answer: 's' }], mj: [{ no: 1, answer: 'k' }] } })
    expect(exam.answer_key).toEqual({ pg: [{ no: 1, answer: 'C' }], bs: [{ no: 1, answer: 'S' }], mj: [{ no: 1, answer: 'K' }] })
  })

  test('validates required fields, answer options, weights and table', async ({ request }) => {
    const { api } = await newTeacher(request)
    const klass = await createClass(api)
    const base = { class_id: klass.id, title: 'T', subject: 'S', exam_date: '2026-01-01', answer_key: STANDARD_KEY, weights: STANDARD_WEIGHTS }

    for (const field of Object.keys(base)) {
      const { [field]: _removed, ...rest } = base
      expect((await api.post('/exams', rest)).status, `missing ${field}`).toBe(400)
    }
    expect((await api.post('/exams', { ...base, class_id: 999999 })).status).toBe(404)

    const badPg = await api.post('/exams', { ...base, answer_key: { pg: [{ no: 3, answer: 'F' }] } })
    expect(badPg.status).toBe(422)
    expect(badPg.body.message).toContain('Bagian PG No.3')
    expect((await api.post('/exams', { ...base, answer_key: { bs: [{ no: 1, answer: 'A' }] } })).status).toBe(422)
    expect((await api.post('/exams', { ...base, answer_key: { mj: [{ no: 1, answer: 'L' }] } })).status).toBe(422)

    const badSum = await api.post('/exams', { ...base, weights: { pg: 50, bs: 20, mj: 10 } })
    expect(badSum.status).toBe(422)
    expect(badSum.body.message).toBe('Total bobot harus 100')
    expect((await api.post('/exams', { ...base, weights: { pg: 120, bs: -20, mj: 0 } })).status).toBe(422)
    expect((await api.post('/exams', { ...base, weights: { pg: '70', bs: 20, mj: 10 } })).status).toBe(422)

    const shortTable = await api.post('/exams', { ...base, weights: { ...STANDARD_WEIGHTS, table: [0, 100] } })
    expect(shortTable.status).toBe(422)
    expect(shortTable.body.message).toContain('10 nilai')
    expect((await api.post('/exams', { ...base, answer_key: { pg: [{ no: 1, answer: 'A' }] }, weights: { ...STANDARD_WEIGHTS, table: [0, 101] } })).status).toBe(422)
  })

  test('search and filters', async ({ request }) => {
    const { api } = await newTeacher(request)
    const a = await createClass(api)
    const b = await createClass(api)
    await createExam(api, a.id, { title: 'Ulangan Aljabar', subject: 'Matematika' })
    await createExam(api, b.id, { title: 'Ulangan Sel', subject: 'Biologi' })

    const titles = (res) => res.body.data.map((e) => e.title)
    expect(titles(await api.get('/exams?search=aljabar'))).toEqual(['Ulangan Aljabar'])
    expect(titles(await api.get('/exams?search=biologi'))).toEqual(['Ulangan Sel'])
    expect(titles(await api.get('/exams?subject=matematika'))).toEqual(['Ulangan Aljabar'])
    expect(titles(await api.get(`/exams?class_id=${b.id}`))).toEqual(['Ulangan Sel'])
    expect(titles(await api.get('/exams?sort=title&order=asc'))).toEqual(['Ulangan Aljabar', 'Ulangan Sel'])
  })

  test('changing the key or rules recalculates saved scores', async ({ request }) => {
    const { api, student, exam } = await scenario(request)
    const sheet = { pg: answers('ABCDA'), bs: answers('BB'), mj: answers('AA') }
    const graded = await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: sheet })
    // PG 4/5 x 70 = 56, B/S 1/2 x 20 = 10, MJ 1/2 x 10 = 5
    expect(graded.body.score).toBe(71)

    // Key now matches question PG 5: PG 5/5 x 70 = 70, total 85
    const newKey = { ...STANDARD_KEY, pg: ['A', 'B', 'C', 'D', 'A'].map((answer, i) => ({ no: i + 1, answer })) }
    const rekey = await api.put(`/exams/${exam.id}`, { answer_key: newKey })
    expect(rekey.body.regraded).toBe(1)
    let saved = (await api.get(`/exams/${exam.id}/results`)).body.data[0]
    expect(Number(saved.score)).toBe(85)
    expect(saved.grade).toBe('B')

    // 7 of 9 correct under a conversion table
    const table = [0, 10, 20, 30, 40, 50, 60, 77, 90, 100]
    const rerule = await api.put(`/exams/${exam.id}`, { weights: { ...STANDARD_WEIGHTS, table } })
    expect(rerule.body.regraded).toBe(1)
    saved = (await api.get(`/exams/${exam.id}/results`)).body.data[0]
    expect(Number(saved.score)).toBe(77)
    expect(saved.grade).toBe('C')
  })

  test('editing only the title does not touch saved scores', async ({ request }) => {
    const { api, student, exam } = await scenario(request)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE') } })
    const before = (await api.get(`/exams/${exam.id}/results`)).body.data[0]
    const res = await api.put(`/exams/${exam.id}`, { title: 'Judul baru' })
    expect(res.body.regraded).toBe(0)
    const after = (await api.get(`/exams/${exam.id}/results`)).body.data[0]
    expect(after.graded_at).toBe(before.graded_at)
    expect(after.score).toBe(before.score)
  })

  test('update refuses invalid values and keeps the exam unchanged', async ({ request }) => {
    const { api, exam } = await scenario(request)
    expect((await api.put(`/exams/${exam.id}`, { weights: { pg: 10, bs: 10, mj: 10 } })).status).toBe(422)
    expect((await api.put(`/exams/${exam.id}`, { answer_key: { pg: [{ no: 1, answer: 'Z' }] } })).status).toBe(422)
    // Table no longer matches a changed number of questions
    await api.put(`/exams/${exam.id}`, { weights: { ...STANDARD_WEIGHTS, table: [0, 10, 20, 30, 40, 50, 60, 70, 80, 100] } })
    expect((await api.put(`/exams/${exam.id}`, { answer_key: { pg: [{ no: 1, answer: 'A' }] } })).status).toBe(422)
    expect((await api.get(`/exams/${exam.id}`)).body.answer_key).toEqual(STANDARD_KEY)
  })

  test('results: search, grade filter and sorting', async ({ request }) => {
    const { api, klass, exam } = await scenario(request)
    const top = await createStudent(api, klass.id, { name: 'Tertinggi' })
    const low = await createStudent(api, klass.id, { name: 'Terendah' })
    await api.post('/grade', { exam_id: exam.id, student_id: top.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    await api.post('/grade', { exam_id: exam.id, student_id: low.id, answers: { pg: answers('EEEEA') } })

    const names = (res) => res.body.data.map((r) => r.student_name)
    expect(names(await api.get(`/exams/${exam.id}/results`))).toEqual(['Tertinggi', 'Terendah'])
    expect(names(await api.get(`/exams/${exam.id}/results?sort=score&order=asc`))).toEqual(['Terendah', 'Tertinggi'])
    expect(names(await api.get(`/exams/${exam.id}/results?grade=A`))).toEqual(['Tertinggi'])
    expect(names(await api.get(`/exams/${exam.id}/results?search=rendah`))).toEqual(['Terendah'])
  })
})
