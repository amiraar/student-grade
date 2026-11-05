import { test, expect } from '@playwright/test'
import { answers, createClass, newTeacher, parseCsv, scenario, uid } from '../helpers.js'

test.describe("one teacher cannot touch another teacher's data", () => {
  test('reads', async ({ request }) => {
    const owner = await scenario(request)
    const intruder = await newTeacher(request)
    await owner.api.post('/grade', { exam_id: owner.exam.id, student_id: owner.student.id, answers: { pg: answers('ABCDE') } })
    const { klass, student, exam } = owner

    for (const path of [
      `/classes/${klass.id}`,
      `/classes/${klass.id}/students`,
      `/classes/${klass.id}/report`,
      `/students/${student.id}`,
      `/exams/${exam.id}`,
      `/reports/export?class_id=${klass.id}`
    ]) {
      expect((await intruder.api.get(path)).status, path).toBe(404)
    }

    for (const path of [`/exams/${exam.id}/results`, `/students/${student.id}/results`]) {
      const res = await intruder.api.get(path)
      expect(res.status, path).toBe(200)
      expect(res.body.total, path).toBe(0)
    }

    const csv = await intruder.api.get(`/exams/${exam.id}/results/export`)
    expect(parseCsv(csv.text)).toHaveLength(1) // header only
    expect(csv.text).not.toContain(student.name)

    for (const list of ['/classes', '/students', '/exams']) {
      expect((await intruder.api.get(list)).body.total, list).toBe(0)
    }
    expect((await intruder.api.get(`/students?class_id=${klass.id}`)).body.total).toBe(0)
    expect((await intruder.api.get(`/exams?class_id=${klass.id}`)).body.total).toBe(0)
  })

  test('writes change nothing', async ({ request }) => {
    const owner = await scenario(request)
    const intruder = await newTeacher(request)
    const { klass, student, exam } = owner

    const attempts = [
      ['PUT class', () => intruder.api.put(`/classes/${klass.id}`, { name: 'Dibajak' })],
      ['DELETE class', () => intruder.api.delete(`/classes/${klass.id}`)],
      ['PUT student', () => intruder.api.put(`/students/${student.id}`, { name: 'Dibajak' })],
      ['DELETE student', () => intruder.api.delete(`/students/${student.id}`)],
      ['PUT exam', () => intruder.api.put(`/exams/${exam.id}`, { title: 'Dibajak' })],
      ['DELETE exam', () => intruder.api.delete(`/exams/${exam.id}`)],
      ['POST student into class', () => intruder.api.post('/students', { class_id: klass.id, name: 'Susup', nis: uid() })],
      ['POST exam into class', () => intruder.api.post('/exams', { class_id: klass.id, title: 'x', subject: 'x', exam_date: '2026-01-01', answer_key: exam.answer_key, weights: exam.weights })],
      ['grade', () => intruder.api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE') } })]
    ]
    for (const [name, attempt] of attempts) {
      expect((await attempt()).status, name).toBe(404)
    }

    const nis = `SUSUP-${uid()}`
    const imported = await intruder.api.post('/students/import', { class_id: klass.id, csv: `Nama;NIS\nSusup;${nis}\n` })
    expect(imported.body.inserted).toBe(0)

    expect((await owner.api.get(`/classes/${klass.id}`)).body.name).toBe(klass.name)
    expect((await owner.api.get(`/students/${student.id}`)).body.name).toBe(student.name)
    expect((await owner.api.get(`/exams/${exam.id}`)).body.title).toBe(exam.title)
    expect((await owner.api.get(`/classes/${klass.id}/students`)).body.data).toHaveLength(1)
    expect((await owner.api.get(`/exams/${exam.id}/results`)).body.total).toBe(0)
  })

  test("a student cannot be moved into someone else's class", async ({ request }) => {
    const owner = await scenario(request)
    const other = await newTeacher(request)
    const foreign = await createClass(other.api)
    const res = await owner.api.put(`/students/${owner.student.id}`, { class_id: foreign.id })
    expect(res.status).toBe(404)
    expect((await owner.api.get(`/students/${owner.student.id}`)).body.class_id).toBe(owner.klass.id)
  })
})
