// The list must show the result of the latest search, even when an older request answers later.
//
// Known bug: the pages do not ignore outdated responses, so these fail today. test.fail keeps the
// suite usable as a regression gate; once fixed they report "Expected to fail, but passed".
import { test, expect, loginAs } from './fixtures.js'
import { createClass, createExam, createStudent, answers, newTeacher } from '../helpers.js'

test.fail(() => true, 'Known bug: an outdated search response overwrites the newer one')

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
