import { test, expect, loginAs } from './fixtures.js'
import { newTeacher, uid } from '../helpers.js'

test.describe('with provoked 4xx responses', () => {
  // The browser logs failed requests as console errors; these tests cause them on purpose.
  test.use({ allowedErrors: [/Failed to load resource/] })

  test('wrong password shows the message and stays on the login page', async ({ page, request }) => {
    const teacher = await newTeacher(request)
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(teacher.email)
    await page.getByPlaceholder('Kata sandi').fill('salah-total')
    await page.getByRole('button', { name: 'Masuk' }).click()
    await expect(page.getByText('Email atau kata sandi salah')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('registering a used email shows the message', async ({ page, request }) => {
    const teacher = await newTeacher(request)
    await page.goto('/register')
    await page.getByPlaceholder('Nama lengkap').fill('Duplikat')
    await page.getByPlaceholder('Email').fill(teacher.email)
    await page.getByPlaceholder(/Kata sandi/).fill('rahasia1')
    await page.getByRole('button', { name: 'Daftar' }).click()
    await expect(page.getByText('Email sudah terdaftar')).toBeVisible()
  })

  test('short password shows the message', async ({ page }) => {
    await page.goto('/register')
    await page.getByPlaceholder('Nama lengkap').fill('Pendek')
    await page.getByPlaceholder('Email').fill(`${uid()}@e2e.test`)
    await page.getByPlaceholder(/Kata sandi/).fill('123')
    await page.getByRole('button', { name: 'Daftar' }).click()
    await expect(page.getByText('Kata sandi minimal 6 karakter')).toBeVisible()
  })

  test('an invalid stored token sends the user back to login', async ({ page }) => {
    await loginAs(page, 'token-rusak')
    await page.goto('/classes')
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  })
})

test('register, land on the dashboard, log out, log back in', async ({ page }) => {
  const email = `guru-${uid()}@e2e.test`
  await page.goto('/register')
  await page.getByPlaceholder('Nama lengkap').fill('Bu Sari')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder(/Kata sandi/).fill('rahasia1')
  await page.getByRole('button', { name: 'Daftar' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Ringkasan Aktivitas' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()

  await page.goto('/classes')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Kata sandi').fill('rahasia1')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('heading', { name: 'Ringkasan Aktivitas' })).toBeVisible()
})

test('session survives a reload and deep links', async ({ page, request }) => {
  const teacher = await newTeacher(request)
  await loginAs(page, teacher.token)
  await page.goto('/reports')
  await expect(page.getByRole('heading', { name: 'Laporan' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Laporan' })).toBeVisible()
  await expect(page.getByText(teacher.email)).toBeVisible()
})

test('every protected page redirects anonymous visitors to login', async ({ page }) => {
  for (const path of ['/', '/classes', '/classes/1', '/students', '/students/1', '/exams', '/exams/1', '/exams/1/results', '/exams/1/sheet', '/grade', '/reports']) {
    await page.goto(path)
    await expect(page, path).toHaveURL(/\/login$/)
  }
})

test('login and register link to each other; unknown pages show not found', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Daftar di sini' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('link', { name: 'Masuk di sini' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/halaman/yang/tidak/ada')
  await expect(page.locator('main')).not.toBeEmpty()
  await expect(page.locator('main')).toContainText(/tidak ditemukan|404/i)
})

test('main navigation reaches every section', async ({ page, request }) => {
  const teacher = await newTeacher(request)
  await loginAs(page, teacher.token)
  await page.goto('/')
  const nav = page.locator('header nav:visible')
  for (const [label, heading] of [
    ['Kelas', 'Daftar Kelas'],
    ['Siswa', 'Data Siswa'],
    ['Ujian', 'Ujian'],
    ['Koreksi', 'Koreksi Lembar Jawaban'],
    ['Laporan', 'Laporan'],
    ['Ringkasan', 'Ringkasan Aktivitas']
  ]) {
    await nav.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})
