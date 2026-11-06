import { test, expect, downloadText, loginAs, selectWithOption } from './fixtures.js'
import { createClass, createExam, createStudent, newTeacher, scenario, answers, uid } from '../helpers.js'

test('dashboard counts and recent exams come from the API', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  await createStudent(api, klass.id)
  await createStudent(api, klass.id)
  const exam = await createExam(api, klass.id, { title: 'Ulangan Dashboard' })

  await loginAs(page, token)
  await page.goto('/')
  const stat = (label) => page.locator('div.rounded-2xl').filter({ has: page.getByText(label, { exact: true }) }).locator('p.text-3xl')
  await expect(stat('Kelas')).toHaveText('1')
  await expect(stat('Siswa')).toHaveText('2')
  await expect(stat('Ujian')).toHaveText('1')

  await page.getByRole('link', { name: /Ulangan Dashboard/ }).click()
  await expect(page).toHaveURL(new RegExp(`/exams/${exam.id}$`))
})

test('classes: create, search, open detail', async ({ page, request }) => {
  const { token } = await newTeacher(request)
  await loginAs(page, token)
  await page.goto('/classes')
  await expect(page.getByText('Belum ada kelas.')).toBeVisible()

  await page.getByPlaceholder('Nama kelas').fill('XII Bahasa')
  await page.getByPlaceholder(/Tahun ajaran/).fill('2025/2026')
  await page.locator('select').selectOption({ label: 'Semester 2' })
  await page.getByRole('button', { name: 'Simpan' }).click()

  const row = page.getByRole('link', { name: /XII Bahasa/ })
  await expect(row).toContainText('2025/2026 · Semester 2')
  await expect(page.getByPlaceholder('Nama kelas')).toHaveValue('')

  await page.getByPlaceholder('Cari kelas').fill('tidak-ada')
  await expect(page.getByText('Belum ada kelas.')).toBeVisible()
  await page.getByPlaceholder('Cari kelas').fill('bahasa')
  await expect(row).toBeVisible()

  await row.click()
  await expect(page.getByRole('heading', { name: 'XII Bahasa' })).toBeVisible()
  await expect(page.getByText('2025/2026 · Semester 2')).toBeVisible()
})

test.describe('validation messages', () => {
  test.use({ allowedErrors: [/Failed to load resource/] })

  test('classes: missing fields', async ({ page, request }) => {
    const { token } = await newTeacher(request)
    await loginAs(page, token)
    await page.goto('/classes')
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText('Nama, tahun ajaran, dan semester wajib diisi')).toBeVisible()
  })

  test('students: duplicate NIS', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const taken = await createStudent(api, klass.id)
    await loginAs(page, token)
    await page.goto('/students')
    await page.getByPlaceholder('Nama siswa').fill('Kembar')
    await page.getByPlaceholder('NIS', { exact: true }).fill(taken.nis)
    await selectWithOption(page, 'Pilih kelas').first().selectOption({ label: klass.name })
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText('NIS sudah terdaftar')).toBeVisible()
  })

  test('exams: weights must total 100', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    await loginAs(page, token)
    await page.goto('/exams')
    await selectWithOption(page, 'Pilih kelas').selectOption({ label: klass.name })
    await page.getByPlaceholder('Judul ujian').fill('Bobot salah')
    await page.getByPlaceholder('Mata pelajaran').last().fill('IPA')
    await page.locator('input[type=date]').fill('2026-05-01')
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B')
    await page.getByLabel('Bobot PG (%)').fill('10')
    await page.getByRole('button', { name: 'Simpan Ujian' }).click()
    await expect(page.getByText('Total bobot harus 100')).toBeVisible()
  })

  test('exams: an answer outside the options', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    await loginAs(page, token)
    await page.goto('/exams')
    await selectWithOption(page, 'Pilih kelas').selectOption({ label: klass.name })
    await page.getByPlaceholder('Judul ujian').fill('Kunci salah')
    await page.getByPlaceholder('Mata pelajaran').last().fill('IPA')
    await page.locator('input[type=date]').fill('2026-05-01')
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,Z')
    await page.getByRole('button', { name: 'Simpan Ujian' }).click()
    await expect(page.getByText('Bagian PG No.2: jawaban tidak valid')).toBeVisible()
  })

  test('reports: no class to export', async ({ page, request }) => {
    const { token } = await newTeacher(request)
    await loginAs(page, token)
    await page.goto('/reports')
    await page.getByRole('button', { name: 'Unduh Laporan CSV' }).click()
    await expect(page.getByText('Kelas tidak ditemukan')).toBeVisible()
  })
})

test('students: create, filter, open detail', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const a = await createClass(api, { name: 'Kelas Satu', semester: 1 })
  const b = await createClass(api, { name: 'Kelas Dua', semester: 2 })
  await createStudent(api, b.id, { name: 'Lain Kelas' })
  const nis = `UI-${uid()}`

  await loginAs(page, token)
  await page.goto('/students')
  await page.getByPlaceholder('Nama siswa').fill('Rahma')
  await page.getByPlaceholder('NIS', { exact: true }).fill(nis)
  await selectWithOption(page, 'Pilih kelas').first().selectOption({ label: 'Kelas Satu' })
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Siswa tersimpan.')).toBeVisible()
  await expect(page.getByText(`NIS: ${nis} · Kelas Satu`)).toBeVisible()

  const rahma = page.getByRole('link', { name: 'Rahma' })
  const lain = page.getByRole('link', { name: 'Lain Kelas' })
  await page.getByPlaceholder('Cari nama / NIS').fill(nis.toLowerCase())
  await expect(rahma).toBeVisible()
  await expect(lain).toBeHidden()
  await page.getByPlaceholder('Cari nama / NIS').fill('')
  await expect(lain).toBeVisible()

  await selectWithOption(page, 'Semua kelas').selectOption({ label: 'Kelas Dua' })
  await expect(rahma).toBeHidden()
  await expect(lain).toBeVisible()
  await selectWithOption(page, 'Semua kelas').selectOption({ label: 'Semua kelas' })
  await selectWithOption(page, 'Semua semester').selectOption({ label: 'Semester 1' })
  await expect(rahma).toBeVisible()
  await expect(lain).toBeHidden()

  await rahma.click()
  await expect(page.getByRole('heading', { name: 'Rahma' })).toBeVisible()
  await expect(page.getByText('Belum ada nilai.')).toBeVisible()
  expect(a.id).toBeTruthy()
})

test('students: import pasted CSV, then the same file again is skipped', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  const csv = `Nama;NIS\nImpor Satu;IMP-${uid()}\nImpor Dua;IMP-${uid()}\n`

  await loginAs(page, token)
  await page.goto('/students')
  await selectWithOption(page, 'Pilih kelas tujuan').selectOption({ label: klass.name })
  await page.getByPlaceholder('Tempel CSV di sini').fill(csv)
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('Import selesai: 2 siswa ditambahkan, 0 dilewati')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Impor Satu' })).toBeVisible()
  await expect(page.getByPlaceholder('Tempel CSV di sini')).toHaveValue('')

  await page.getByPlaceholder('Tempel CSV di sini').fill(csv)
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('Import selesai: 0 siswa ditambahkan, 2 dilewati')).toBeVisible()
})

test('students: import an uploaded CSV file', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  await loginAs(page, token)
  await page.goto('/students')
  await selectWithOption(page, 'Pilih kelas tujuan').selectOption({ label: klass.name })
  await page.locator('input[type=file]').setInputFiles({
    name: 'siswa.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`﻿Nama;NIS\nDari File;FILE-${uid()}\n`, 'utf8')
  })
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('Import selesai: 1 siswa ditambahkan, 0 dilewati')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dari File' })).toBeVisible()
})

test('exams: create with weights, tokens split on comma, space and newline', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  await loginAs(page, token)
  await page.goto('/exams')

  await selectWithOption(page, 'Pilih kelas').selectOption({ label: klass.name })
  await page.getByPlaceholder('Judul ujian').fill('Ulangan Harian')
  await page.getByPlaceholder('Mata pelajaran').last().fill('Sejarah')
  await page.locator('input[type=date]').fill('2026-08-17')
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('a, b c\nd;e')
  await page.getByLabel(/Kunci Benar/).fill('B,S')
  await page.getByLabel(/Kunci Menjodohkan/).fill('K')
  await page.getByRole('button', { name: 'Simpan Ujian' }).click()

  await expect(page.getByText('Ujian tersimpan (PG 5, B/S 2, MJ 1 soal).')).toBeVisible()
  const row = page.getByRole('link', { name: /Ulangan Harian/ })
  await expect(row).toContainText('Sejarah · 2026-08-17')

  await row.click()
  await expect(page.getByLabel(/Kunci Pilihan Ganda/)).toHaveValue('ABCDE')
  await expect(page.getByLabel(/Kunci Benar/)).toHaveValue('BS')
  await expect(page.getByLabel(/Kunci Menjodohkan/)).toHaveValue('K')
  await expect(page.locator('input[type=date]')).toHaveValue('2026-08-17')
})

test('exams: conversion table is built from the key and saved', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  await loginAs(page, token)
  await page.goto('/exams')

  await selectWithOption(page, 'Pilih kelas').selectOption({ label: klass.name })
  await page.getByPlaceholder('Judul ujian').fill('Pakai Tabel')
  await page.getByPlaceholder('Mata pelajaran').last().fill('Kimia')
  await page.locator('input[type=date]').fill('2026-09-01')
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A,B,C')

  await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
  await expect(page.getByLabel('Nilai jika benar 0')).toHaveValue('0')
  await expect(page.getByLabel('Nilai jika benar 1')).toHaveValue('33.33')
  await expect(page.getByLabel('Nilai jika benar 2')).toHaveValue('66.67')
  await expect(page.getByLabel('Nilai jika benar 3')).toHaveValue('100')

  await page.getByLabel('Nilai jika benar 2').fill('75')
  await page.getByRole('button', { name: 'Simpan Ujian' }).click()
  await expect(page.getByText('Ujian tersimpan (PG 3, B/S 0, MJ 0 soal).')).toBeVisible()

  const saved = (await api.get('/exams')).body.data[0]
  expect(saved.weights.table).toEqual([0, 33.33, 75, 100])

  await page.getByRole('link', { name: /Pakai Tabel/ }).click()
  await expect(page.getByLabel('Nilai jika benar 2')).toHaveValue('75')
  await expect(page.getByRole('radio', { name: /Tabel: jumlah benar/ })).toBeChecked()
})

test('exam detail: editing the key recalculates saved scores and says how many', async ({ page, request }) => {
  const { api, token, student, exam } = await scenario(request)
  await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })

  await loginAs(page, token)
  await page.goto(`/exams/${exam.id}`)
  await page.getByPlaceholder('Judul').fill('Judul Diubah')
  await page.getByLabel(/Kunci Pilihan Ganda/).fill('A, B, C, D, A')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Simpan Perubahan' }).click()
  await expect(page.getByText('Perubahan tersimpan. 1 nilai siswa dihitung ulang.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Judul Diubah' })).toBeVisible()

  await page.getByRole('link', { name: 'Lihat Hasil' }).click()
  // PG 4/5 x 70 = 56 + 20 + 10
  await expect(page.getByText('Nilai 86 · Grade B · PG 4/5 · B/S 2/2 · MJ 2/2')).toBeVisible()
})

test('results and student history show the same score; filters work; CSV downloads', async ({ page, request }) => {
  const { api, token, klass, exam } = await scenario(request)
  const budi = await createStudent(api, klass.id, { name: 'Budi Tinggi' })
  const cici = await createStudent(api, klass.id, { name: 'Cici Rendah' })
  await api.post('/grade', { exam_id: exam.id, student_id: budi.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
  await api.post('/grade', { exam_id: exam.id, student_id: cici.id, answers: { pg: answers('BBBBB') } })

  await loginAs(page, token)
  await page.goto(`/exams/${exam.id}/results`)
  await expect(page.getByText('Nilai 100 · Grade A')).toBeVisible()
  await expect(page.getByText('Nilai 14 · Grade E')).toBeVisible()

  await selectWithOption(page, 'Semua grade').selectOption('A')
  await expect(page.getByText('Budi Tinggi')).toBeVisible()
  await expect(page.getByText('Cici Rendah')).toBeHidden()
  await selectWithOption(page, 'Semua grade').selectOption('')
  // Wait for the list before searching: overlapping requests are covered by stale-search.spec.js
  await expect(page.getByText('Cici Rendah')).toBeVisible()
  await page.getByPlaceholder('Cari siswa').fill('cici')
  await expect(page.getByText('Cici Rendah')).toBeVisible()
  await expect(page.getByText('Budi Tinggi')).toBeHidden()

  const { download, text: csv } = await downloadText(page, () => page.getByRole('button', { name: 'Unduh CSV' }).click())
  expect(download.suggestedFilename()).toBe('hasil-ujian.csv')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  expect(csv).toContain('Budi Tinggi')
  expect(csv).toContain('Cici Rendah')

  await page.goto(`/students/${budi.id}`)
  await expect(page.getByText(exam.title)).toBeVisible()
  await expect(page.getByText(/Nilai 100/)).toBeVisible()

  await page.goto(`/classes/${klass.id}`)
  await expect(page.getByRole('link', { name: 'Budi Tinggi' })).toBeVisible()
})

test('reports: downloads the class report with the filters applied', async ({ page, request }) => {
  const { api, token } = await newTeacher(request)
  const a = await createClass(api, { name: 'Laporan A' })
  const b = await createClass(api, { name: 'Laporan B' })
  await createStudent(api, a.id, { name: 'Anak A' })
  await createStudent(api, b.id, { name: 'Anak B' })

  await loginAs(page, token)
  await page.goto('/reports')
  await selectWithOption(page, 'Pilih kelas').selectOption({ label: 'Laporan B' })
  const { download, text: csv } = await downloadText(page, () => page.getByRole('button', { name: 'Unduh Laporan CSV' }).click())
  expect(download.suggestedFilename()).toBe('laporan-kelas.csv')
  expect(csv).toContain('Anak B')
  expect(csv).not.toContain('Anak A')
})

test.describe('answer key formats', () => {
  async function openForm(page, request) {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api, { name: 'Kelas Kunci' })
    await loginAs(page, token)
    await page.goto('/exams')
    await selectWithOption(page, 'Pilih kelas').selectOption({ label: klass.name })
    await page.getByPlaceholder('Judul ujian').fill('Format Kunci')
    await page.getByPlaceholder('Mata pelajaran').last().fill('IPA')
    await page.locator('input[type=date]').fill('2026-05-01')
    return api
  }

  for (const [label, typed, expected] of [
    ['commas', 'A,B,C,D', 'ABCD'],
    ['one per line', 'A\nB\nC\nD', 'ABCD'],
    ['letters run together, several lines', 'AA\nBA\nCCA\nDDAB', 'AABACCADDAB'],
    ['numbered lines', '1. A\n2. B\n3) C\n4 D', 'ABCD']
  ]) {
    test(`${label} are read one letter per question`, async ({ page, request }) => {
      const api = await openForm(page, request)
      await page.getByLabel(/Kunci Pilihan Ganda/).fill(typed)
      await page.getByRole('button', { name: 'Simpan Ujian' }).click()
      await expect(page.getByText(`Ujian tersimpan (PG ${expected.length}, B/S 0, MJ 0 soal).`)).toBeVisible()

      const saved = (await api.get('/exams')).body.data[0].answer_key.pg
      expect(saved.map((item) => item.answer).join('')).toBe(expected)
      expect(saved.map((item) => item.no)).toEqual(expected.split('').map((_, i) => i + 1))
    })
  }

  test('every section accepts letters run together', async ({ page, request }) => {
    const api = await openForm(page, request)
    await page.getByLabel(/Kunci Benar/).fill('bssb')
    await page.getByLabel(/Kunci Menjodohkan/).fill('KJ\nA')
    await page.getByRole('button', { name: 'Simpan Ujian' }).click()
    await expect(page.getByText('Ujian tersimpan (PG 0, B/S 4, MJ 3 soal).')).toBeVisible()
    const key = (await api.get('/exams')).body.data[0].answer_key
    expect(key.bs.map((item) => item.answer)).toEqual(['B', 'S', 'S', 'B'])
    expect(key.mj.map((item) => item.answer)).toEqual(['K', 'J', 'A'])
  })

  test('the form shows how the key is read, before saving', async ({ page, request }) => {
    await openForm(page, request)
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('AA\nBA')
    await expect(page.getByText('4 soal', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Hasil bacaan Pilihan Ganda' }).getByRole('listitem')).toHaveText(['1A', '2A', '3B', '4A'])
  })

  test('the form marks a wrong letter before saving', async ({ page, request }) => {
    await openForm(page, request)
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('AZC')
    await expect(page.getByText('Periksa nomor 2. Pakai huruf A–E.')).toBeVisible()
    await expect(page.getByLabel(/Kunci Pilihan Ganda/)).toHaveAttribute('aria-invalid', 'true')

    await page.getByLabel(/Kunci Benar/).fill('BA')
    await expect(page.getByText('Periksa nomor 2. Pakai huruf B atau S.')).toBeVisible()

    await page.getByLabel(/Kunci Pilihan Ganda/).fill('ABC')
    await expect(page.getByText('Periksa nomor 2. Pakai huruf A–E.')).toBeHidden()
    await expect(page.getByLabel(/Kunci Pilihan Ganda/)).toHaveAttribute('aria-invalid', 'false')
  })

  test('the conversion table counts letters as questions', async ({ page, request }) => {
    await openForm(page, request)
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('AB\nC')
    await page.getByRole('radio', { name: /Tabel: jumlah benar/ }).check()
    await expect(page.getByLabel('Nilai jika benar 3')).toHaveValue('100')
    await expect(page.getByLabel('Nilai jika benar 1')).toHaveValue('33.33')
  })

  test.describe('with provoked 4xx responses', () => {
    test.use({ allowedErrors: [/Failed to load resource/] })

    for (const [label, typed] of [
      ['a dash', 'A,-,C'],
      ['a letter outside the options', 'AZ'],
      ['a stray number', 'A,1,C']
    ]) {
      test(`${label} is refused, so the numbering cannot shift silently`, async ({ page, request }) => {
        const api = await openForm(page, request)
        await page.getByLabel(/Kunci Pilihan Ganda/).fill(typed)
        await page.getByRole('button', { name: 'Simpan Ujian' }).click()
        await expect(page.getByText('Bagian PG No.2: jawaban tidak valid')).toBeVisible()
        expect((await api.get('/exams')).body.data).toEqual([])
      })
    }
  })

  test('the edit page reads the same formats and regrades', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, { answer_key: { pg: [{ no: 1, answer: 'A' }] } })
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('A') } })
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}`)

    await page.getByLabel(/Kunci Pilihan Ganda/).fill('AB\nCD')
    await expect(page.getByRole('list', { name: 'Hasil bacaan Pilihan Ganda' }).getByRole('listitem')).toHaveText(['1A', '2B', '3C', '4D'])
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click()
    await expect(page.getByText('Perubahan tersimpan. 1 nilai siswa dihitung ulang.')).toBeVisible()
    expect((await api.get(`/exams/${exam.id}`)).body.answer_key.pg.map((item) => item.answer)).toEqual(['A', 'B', 'C', 'D'])
    expect((await api.get(`/exams/${exam.id}/results`)).body.data[0].score).toBe('25.00')
  })
})
