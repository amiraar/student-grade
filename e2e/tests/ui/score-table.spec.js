import { test, expect, loginAs } from './fixtures.js'
import { newTeacher } from '../helpers.js'

const tableValues = (page) => page.locator('input[aria-label^="Nilai jika benar"]').evaluateAll((inputs) => inputs.map((i) => Number(i.value)))

async function openExamForm(page, request) {
  const { token } = await newTeacher(request)
  await loginAs(page, token)
  await page.goto('/exams')
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).waitFor()
}

const SCORE_TABLE_BUG = 'Known bug (ScoreRules.vue): new rows inherit the old top score, e.g. [0, 100, 100, 100]'

test('table chosen before the key is typed: untouched values stay proportional', async ({ page, request }) => {
  test.fail(true, SCORE_TABLE_BUG)
  await openExamForm(page, request)
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await expect(page.getByText('Isi kunci jawaban dulu.')).toBeVisible()

  // pressSequentially fires an input event per key, as a real teacher typing does
  await page.getByLabel(/Kunci Pilihan Ganda/).pressSequentially('A,B,C')
  await expect(page.getByLabel('Nilai jika benar 3')).toBeVisible()
  expect(await tableValues(page)).toEqual([0, 33.33, 66.67, 100])
})

test('adding a question to an untouched table keeps it proportional', async ({ page, request }) => {
  test.fail(true, SCORE_TABLE_BUG)
  await openExamForm(page, request)
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B')
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await expect(page.getByLabel('Nilai jika benar 2')).toHaveValue('100')

  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C')
  await expect(page.getByLabel('Nilai jika benar 3')).toBeVisible()
  expect(await tableValues(page)).toEqual([0, 33.33, 66.67, 100])
})

test('removing a question from a table keeps the top score at 100', async ({ page, request }) => {
  await openExamForm(page, request)
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C,D')
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await expect(page.getByLabel('Nilai jika benar 4')).toHaveValue('100')

  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C')
  await expect(page.getByLabel('Nilai jika benar 4')).toBeHidden()
  expect(await tableValues(page)).toEqual([0, 25, 50, 100])
})

test('a value the teacher typed survives adding a question', async ({ page, request }) => {
  await openExamForm(page, request)
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C')
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await page.getByLabel('Nilai jika benar 1').fill('40')

  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C,D')
  await expect(page.getByLabel('Nilai jika benar 4')).toHaveValue('100')
  await expect(page.getByLabel('Nilai jika benar 1')).toHaveValue('40')
})

test('the reset button restores proportional values', async ({ page, request }) => {
  await openExamForm(page, request)
  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await page.getByLabel(/Kunci Pilihan Ganda/).pressSequentially('A,B,C')
  await page.getByRole('button', { name: /Isi ulang otomatis/ }).click()
  expect(await tableValues(page)).toEqual([0, 33.33, 66.67, 100])
})
