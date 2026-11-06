import { test, expect, loginAs, selectWithOption } from './fixtures.js'
import { answers, createClass, createExam, createStudent, newTeacher, scenario } from '../helpers.js'

const noSideScroll = async (page, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${label}: page wider than the screen by ${overflow}px`).toBeLessThanOrEqual(0)
}

test('every page fits the phone screen and shows the full menu', async ({ page, request }) => {
  const ctx = await scenario(request)
  await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.student.id, answers: { pg: answers('ABCDE') } })
  await loginAs(page, ctx.token)

  for (const path of ['/', '/classes', `/classes/${ctx.klass.id}`, '/students', `/students/${ctx.student.id}`, '/exams', `/exams/${ctx.exam.id}`, `/exams/${ctx.exam.id}/results`, '/grade', '/reports']) {
    await page.goto(path)
    await expect(page.locator('main h1').first(), path).toBeVisible()
    await noSideScroll(page, path)
    for (const label of ['Ringkasan', 'Kelas', 'Siswa', 'Ujian', 'Koreksi', 'Laporan']) {
      await expect(page.locator('header nav:visible').getByRole('link', { name: label, exact: true }), `${path} ${label}`).toBeVisible()
    }
  }
})

test('a long answer key stays within the phone screen', async ({ page, request }) => {
  const ctx = await scenario(request)
  await loginAs(page, ctx.token)
  await page.goto('/exams')
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('ABCDE'.repeat(20))
  await expect(page.getByText('100 soal', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Hasil bacaan Pilihan Ganda' }).getByRole('listitem')).toHaveCount(100)
  await noSideScroll(page, '/exams with a 100 question key')
})

test('login page fits the phone screen', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible()
  await noSideScroll(page, '/login')
})

test('manual grading works on a phone', async ({ page, request }) => {
  const ctx = await scenario(request)
  await loginAs(page, ctx.token)
  await page.goto('/grade')
  await selectWithOption(page, '1. Pilih kelas').selectOption({ label: ctx.klass.name })
  await selectWithOption(page, '2. Pilih ujian').selectOption({ label: `${ctx.exam.title} · ${ctx.exam.exam_date}` })
  await selectWithOption(page, 'Pilih siswa untuk diperiksa').selectOption({ label: `${ctx.student.name} — belum dinilai` })

  await page.getByLabel('Ketik cepat jawaban Pilihan Ganda').fill('ABCDE')
  await page.getByLabel('Ketik cepat jawaban Benar/Salah').fill('BS')
  await page.getByLabel('Ketik cepat jawaban Menjodohkan').fill('AB')
  await expect(page.getByText('Nilai: 100 (A)')).toBeVisible()
  await noSideScroll(page, '/grade with table')

  await page.getByRole('button', { name: 'Simpan', exact: true }).tap()
  await expect(page.getByText('Tersimpan.')).toBeVisible()
  expect(Number((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data[0].score)).toBe(100)
})

test('the new forms, the pager and the steps fit the phone screen', async ({ page, request }) => {
  test.slow() // sets up enough students for a second page
  const { api, token } = await newTeacher(request)
  await loginAs(page, token)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mulai dari sini' })).toBeVisible()
  await noSideScroll(page, 'steps')

  const klass = await createClass(api)
  const student = await createStudent(api, klass.id)
  for (let i = 0; i < 20; i++) await createStudent(api, klass.id)
  const exam = await createExam(api, klass.id)

  await page.goto(`/classes/${klass.id}`)
  await page.getByRole('button', { name: 'Edit Kelas' }).click()
  await expect(page.getByPlaceholder('Nama kelas')).toBeVisible()
  await noSideScroll(page, 'class edit')

  await page.goto(`/students/${student.id}`)
  await page.getByRole('button', { name: 'Edit Siswa' }).click()
  await expect(page.getByPlaceholder('Nama siswa')).toBeVisible()
  await noSideScroll(page, 'student edit')

  await page.goto('/students')
  await expect(page.getByRole('navigation', { name: 'Halaman daftar' })).toBeVisible()
  await noSideScroll(page, 'pager')

  await page.goto(`/exams/${exam.id}/results`)
  await expect(page.getByRole('heading', { name: /Belum dinilai/ })).toBeVisible()
  await noSideScroll(page, 'results with missing students')
})

test('save stays on screen while a long answer table is scrolled', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  const student = await createStudent(api, klass.id)
  const exam = await createExam(api, klass.id, {
    answer_key: { pg: Array.from({ length: 40 }, (_, i) => ({ no: i + 1, answer: 'A' })), bs: [], mj: [] }
  })
  await loginAs(page, token)
  await page.goto(`/grade?exam=${exam.id}&student=${student.id}`)
  await page.getByLabel('Jawaban Pilihan Ganda nomor 20').scrollIntoViewIfNeeded()

  const save = page.getByRole('button', { name: 'Simpan', exact: true })
  const box = await save.boundingBox()
  const screen = page.viewportSize()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(screen.height)
  await noSideScroll(page, 'long answer table')

  await page.getByLabel('Jawaban Pilihan Ganda nomor 20').fill('A')
  await save.tap()
  await expect(page.getByText('Tersimpan.')).toBeVisible()
})

test('print page preview is shrunk on phones', async ({ page, request }) => {
  const ctx = await scenario(request)
  await loginAs(page, ctx.token)
  await page.goto(`/exams/${ctx.exam.id}/sheet?student=all`)
  await expect(page.locator('.sheet')).toBeVisible()
  await noSideScroll(page, 'print page')
})
