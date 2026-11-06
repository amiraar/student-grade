import { test, expect, loginAs, selectWithOption } from './fixtures.js'
import { answers, scenario } from '../helpers.js'

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

test('print page preview is shrunk on phones', async ({ page, request }) => {
  const ctx = await scenario(request)
  await loginAs(page, ctx.token)
  await page.goto(`/exams/${ctx.exam.id}/sheet?student=all`)
  await expect(page.locator('.sheet')).toBeVisible()
  await noSideScroll(page, 'print page')
})
