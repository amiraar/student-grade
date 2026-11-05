// A page must show the result of the latest request, even when an older one answers later.
import { test, expect, loginAs, selectWithOption } from './fixtures.js'
import { createClass, createExam, createStudent, answers, newTeacher } from '../helpers.js'

const STALE = 'tidak-ada-yang-cocok'

// Holds back the older request, as a slow mobile connection would
async function searchWithSlowFirstRequest(page, endpoint, box, finalTerm) {
  await page.route(`**${endpoint}?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.get('search') === STALE) {
      await new Promise((done) => setTimeout(done, 700))
    }
    await route.fallback()
  })
  const stale = page.waitForResponse((r) => r.url().includes(`search=${STALE}`))
  await box.fill(STALE)
  await box.fill(finalTerm)
  await stale
  await page.waitForTimeout(200)
}

test('classes page', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  await createClass(api, { name: 'Alfa' })
  await loginAs(page, token)
  await page.goto('/classes')
  await expect(page.getByRole('link', { name: /Alfa/ })).toBeVisible()
  await searchWithSlowFirstRequest(page, '/api/classes', page.getByPlaceholder('Cari kelas'), 'alfa')
  await expect(page.getByRole('link', { name: /Alfa/ })).toBeVisible()
})

test('students page', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  await createStudent(api, (await createClass(api)).id, { name: 'Alfa' })
  await loginAs(page, token)
  await page.goto('/students')
  await expect(page.getByRole('link', { name: 'Alfa' })).toBeVisible()
  await searchWithSlowFirstRequest(page, '/api/students', page.getByPlaceholder('Cari nama / NIS'), 'alfa')
  await expect(page.getByRole('link', { name: 'Alfa' })).toBeVisible()
})

test('exams page', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  await createExam(api, (await createClass(api)).id, { title: 'Alfa' })
  await loginAs(page, token)
  await page.goto('/exams')
  await expect(page.getByRole('link', { name: /Alfa/ })).toBeVisible()
  await searchWithSlowFirstRequest(page, '/api/exams', page.getByPlaceholder('Cari judul'), 'alfa')
  await expect(page.getByRole('link', { name: /Alfa/ })).toBeVisible()
})

test('exam results page', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  const student = await createStudent(api, klass.id, { name: 'Alfa' })
  const exam = await createExam(api, klass.id)
  await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE') } })
  await loginAs(page, token)
  await page.goto(`/exams/${exam.id}/results`)
  await expect(page.getByText('Alfa')).toBeVisible()
  await searchWithSlowFirstRequest(page, `/api/exams/${exam.id}/results`, page.getByPlaceholder('Cari siswa'), 'alfa')
  await expect(page.getByText('Alfa')).toBeVisible()
})

const delay = (route) => new Promise((done) => setTimeout(done, 700)).then(() => route.fallback())

test('grade page: switching exam keeps the key of the exam now selected', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  const student = await createStudent(api, klass.id)
  const first = await createExam(api, klass.id, { title: 'Satu Soal', answer_key: { pg: [{ no: 1, answer: 'A' }] } })
  const second = await createExam(api, klass.id, { title: 'Lima Soal' })
  await loginAs(page, token)
  await page.goto('/grade')
  await selectWithOption(page, '1. Pilih kelas').selectOption({ label: klass.name })

  await page.route(`**/api/exams/${first.id}`, delay)
  await page.route(`**/api/exams/${first.id}/results?*`, delay)
  const stale = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/exams/${first.id}`)
  const exam = selectWithOption(page, '2. Pilih ujian')
  await exam.selectOption({ label: `${first.title} · ${first.exam_date}` })
  await exam.selectOption({ label: `${second.title} · ${second.exam_date}` })
  await stale
  await page.waitForTimeout(200)

  await selectWithOption(page, 'Pilih siswa untuk diperiksa').selectOption({ label: `${student.name} — belum dinilai` })
  await expect(page.getByLabel('Jawaban Pilihan Ganda nomor 5')).toBeVisible()
})

test('grade page: switching class keeps the exams of the class now selected', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const firstClass = await createClass(api)
  const secondClass = await createClass(api)
  const firstExam = await createExam(api, firstClass.id, { title: 'Ujian Kelas Pertama' })
  const secondExam = await createExam(api, secondClass.id, { title: 'Ujian Kelas Kedua' })
  await loginAs(page, token)
  await page.goto('/grade')

  const slow = (route) => (new URL(route.request().url()).searchParams.get('class_id') === String(firstClass.id) ? delay(route) : route.fallback())
  await page.route('**/api/exams?*', slow)
  await page.route('**/api/students?*', slow)
  const stale = page.waitForResponse((r) => r.url().includes('/api/exams?') && r.url().includes(`class_id=${firstClass.id}`))
  const klass = selectWithOption(page, '1. Pilih kelas')
  await klass.selectOption({ label: firstClass.name })
  await klass.selectOption({ label: secondClass.name })
  await stale
  await page.waitForTimeout(200)

  const options = page.locator('option')
  await expect(options.filter({ hasText: secondExam.title })).toHaveCount(1)
  await expect(options.filter({ hasText: firstExam.title })).toHaveCount(0)
})
