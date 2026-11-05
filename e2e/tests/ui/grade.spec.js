import { test, expect, loginAs, selectWithOption } from './fixtures.js'
import { answers, createClass, createExam, createStudent, newTeacher, scenario } from '../helpers.js'
import { BUBBLE_RADIUS, buildLayout, countsFromKey } from '../../../frontend/src/lib/sheet.js'

async function openGrade(page, ctx) {
  await loginAs(page, ctx.token)
  await page.goto('/grade')
  await selectWithOption(page, '1. Pilih kelas').selectOption({ label: ctx.klass.name })
  await selectWithOption(page, '2. Pilih ujian').selectOption({ label: `${ctx.exam.title} · ${ctx.exam.exam_date}` })
  await expect(page.getByText(/Sudah dinilai:/)).toBeVisible()
}

const pickStudent = (page) => selectWithOption(page, 'Pilih siswa untuk diperiksa')

// Renders the real print page, marks the given answers on it and returns a PNG, i.e. a clean photo
async function photographSheet(page, exam, studentName, marks) {
  await page.goto(`/exams/${exam.id}/sheet?student=all`)
  const sheet = page.locator('.sheet').filter({ hasText: studentName })
  await expect(sheet).toBeVisible()

  const dots = []
  for (const section of buildLayout(countsFromKey(exam.answer_key)).sections) {
    for (const question of section.questions) {
      const chosen = marks[section.key]?.[question.no - 1]
      for (const option of chosen || []) {
        const bubble = question.bubbles.find((b) => b.option === option)
        dots.push({ x: bubble.x, y: bubble.y })
      }
    }
  }
  await sheet.evaluate((element, { dots, radius }) => {
    for (const { x, y } of dots) {
      const dot = document.createElement('div')
      dot.style.cssText = `position:absolute;left:${x - radius}mm;top:${y - radius}mm;width:${radius * 2}mm;height:${radius * 2}mm;border-radius:50%;background:#111`
      element.appendChild(dot)
    }
  }, { dots, radius: BUBBLE_RADIUS * 0.95 })
  return sheet.screenshot({ type: 'png' })
}

test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })

test.describe('manual input', () => {
  test('quick typing, live score, save, reload', async ({ page, request }) => {
    const ctx = await scenario(request)
    await openGrade(page, ctx)
    await pickStudent(page).selectOption({ label: `${ctx.student.name} — belum dinilai` })

    await expect(page.getByRole('heading', { name: ctx.student.name })).toBeVisible()
    await expect(page.getByText('Nilai: 0 (E)')).toBeVisible()
    await expect(page.getByText('Belum disimpan. Isi jawaban siswa lalu klik Simpan.')).toBeVisible()

    await page.getByLabel('Ketik cepat jawaban Pilihan Ganda').fill('abcda')
    await page.getByLabel('Ketik cepat jawaban Benar/Salah').fill('bb')
    await page.getByLabel('Ketik cepat jawaban Menjodohkan').fill('ab')
    // Live score before saving: 56 + 10 + 10
    await expect(page.getByText('Nilai: 76 (C)')).toBeVisible()
    await expect(page.getByText('Benar 7 dari 9 soal')).toBeVisible()
    await expect(page.getByLabel('Jawaban Pilihan Ganda nomor 5')).toHaveValue('A')

    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()
    await expect(page.getByText('Sudah dinilai: 1 dari 1 siswa').or(page.getByText(/Sudah dinilai:\s*1\s*dari 1/))).toBeVisible()
    await expect(page.getByText('Sumber: Input manual')).toBeVisible()

    await page.reload()
    await selectWithOption(page, '1. Pilih kelas').selectOption({ label: ctx.klass.name })
    await selectWithOption(page, '2. Pilih ujian').selectOption({ label: `${ctx.exam.title} · ${ctx.exam.exam_date}` })
    await pickStudent(page).selectOption({ label: `${ctx.student.name} — 76` })
    await expect(page.getByLabel('Jawaban Pilihan Ganda nomor 5')).toHaveValue('A')
    await expect(page.getByText('Nilai: 76 (C)')).toBeVisible()
  })

  test('live score matches what the server saves, for a typed cell change', async ({ page, request }) => {
    const ctx = await scenario(request)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    await openGrade(page, ctx)
    await pickStudent(page).selectOption({ label: `${ctx.student.name} — 100` })

    await page.getByLabel('Jawaban Pilihan Ganda nomor 1').fill('!!')
    await expect(page.getByText('Nilai: 86 (B)')).toBeVisible()
    await expect(page.getByText('Berubah dari 100, belum disimpan.')).toBeVisible()

    await page.getByLabel('Jawaban Benar/Salah nomor 2').fill('-')
    await expect(page.getByText('Nilai: 76 (C)')).toBeVisible()

    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()
    const saved = (await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data[0]
    expect(Number(saved.score)).toBe(76)
    expect(saved.detail.pg.double).toBe(1)
    expect(saved.detail.bs.empty).toBe(1)
  })

  test('next student skips those already graded and says when all are done', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const exam = await createExam(api, klass.id)
    const a = await createStudent(api, klass.id, { name: 'A Pertama' })
    await createStudent(api, klass.id, { name: 'B Kedua' })
    const c = await createStudent(api, klass.id, { name: 'C Ketiga' })
    await api.post('/grade', { exam_id: exam.id, student_id: c.id, answers: { pg: answers('ABCDE') } })

    await openGrade(page, { token, klass, exam })
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()

    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByRole('heading', { name: 'B Kedua' })).toBeVisible()
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()

    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByText('Semua siswa di kelas ini sudah dinilai.')).toBeVisible()
    expect(a.id).toBeTruthy()
  })

  test('a class without exams says so', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    await loginAs(page, token)
    await page.goto('/grade')
    await selectWithOption(page, '1. Pilih kelas').selectOption({ label: klass.name })
    await expect(page.getByText('Kelas ini belum punya ujian. Buat ujian dulu di menu Ujian.')).toBeVisible()
  })

  test('conversion table drives the live and saved score', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: ['A', 'B', 'C'].map((answer, i) => ({ no: i + 1, answer })), bs: [], mj: [] },
      weights: { pg: 70, bs: 20, mj: 10, table: [0, 40, 73.5, 100] }
    })
    await openGrade(page, { token, klass, exam })
    await pickStudent(page).selectOption({ label: `${student.name} — belum dinilai` })
    await page.getByLabel('Ketik cepat jawaban Pilihan Ganda').fill('ABA')
    await expect(page.getByText('Nilai: 73.5 (C)')).toBeVisible()
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()
    expect(Number((await api.get(`/exams/${exam.id}/results`)).body.data[0].score)).toBe(73.5)
  })
})

test.describe('print page', () => {
  test('one sheet per student or one blank sheet', async ({ page, request }) => {
    const ctx = await scenario(request)
    const second = await createStudent(ctx.api, ctx.klass.id)
    await loginAs(page, ctx.token)
    await page.goto(`/exams/${ctx.exam.id}/sheet?student=all`)

    await expect(page.locator('.sheet')).toHaveCount(2)
    await expect(page.locator('.sheet').filter({ hasText: ctx.student.name })).toContainText(`NIS: ${ctx.student.nis}`)
    await expect(page.locator('.sheet').filter({ hasText: second.name })).toBeVisible()
    await expect(page.locator('.bubble').first()).toBeVisible()

    await page.getByRole('checkbox').uncheck()
    await expect(page.locator('.sheet')).toHaveCount(1)
    await expect(page.locator('.sheet')).toContainText('Nama: ____')
  })

  test('the sheet is A4 sized and controls are hidden when printing', async ({ page, request }) => {
    const ctx = await scenario(request)
    await loginAs(page, ctx.token)
    await page.goto(`/exams/${ctx.exam.id}/sheet?student=all`)
    const box = await page.locator('.sheet').boundingBox()
    // 210 x 297 mm at 96 dpi
    expect(box.width).toBeCloseTo(793.7, 0)
    expect(box.height).toBeCloseTo(1122.5, 0)

    await expect(page.getByRole('button', { name: 'Cetak' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('button', { name: 'Cetak' })).toBeHidden()
    await expect(page.locator('.sheet')).toBeVisible()
  })

  test('too many questions disables printing', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: Array.from({ length: 300 }, (_, i) => ({ no: i + 1, answer: 'A' })), bs: [], mj: [] }
    })
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}/sheet`)
    await expect(page.getByText('Soal terlalu banyak untuk satu halaman.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cetak' })).toBeDisabled()
  })
})

test.describe('from print page to score, without AI', () => {
  test('one photo: student recognized, answers read, opened for checking', async ({ page, request }) => {
    const ctx = await scenario(request)
    await loginAs(page, ctx.token)
    const png = await photographSheet(page, ctx.exam, ctx.student.name, {
      pg: ['A', 'B', 'C', 'D', 'A'],
      bs: ['B', 'B'],
      mj: ['A', 'B']
    })

    await openGrade(page, ctx)
    await page.locator('input[type=file]').setInputFiles({ name: 'lembar.png', mimeType: 'image/png', buffer: png })

    await expect(page.getByRole('heading', { name: ctx.student.name })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(`${ctx.student.name}: 76`)).toBeVisible()
    await expect(page.getByText('Nilai: 76 (C)')).toBeVisible()
    await expect(page.getByText('Sumber: Lembar template (tanpa AI)').or(page.getByText('Benar 7 dari 9 soal'))).toHaveCount(2)
    await expect(page.getByLabel('Jawaban Pilihan Ganda nomor 5')).toHaveValue('A')
    await expect(page.getByLabel('Jawaban Benar/Salah nomor 2')).toHaveValue('B')

    const saved = (await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data[0]
    expect(Number(saved.score)).toBe(76)
    expect(saved.sheet_quality).toBe('template')
  })

  test('several photos at once: each goes to the right student; blank and double marks are read', async ({ page, request }) => {
    const ctx = await scenario(request)
    const second = await createStudent(ctx.api, ctx.klass.id, { name: 'Zaki Kedua' })
    await loginAs(page, ctx.token)
    const first = await photographSheet(page, ctx.exam, ctx.student.name, { pg: ['A', 'B', 'C', 'D', 'E'], bs: ['B', 'S'], mj: ['A', 'B'] })
    const other = await photographSheet(page, ctx.exam, second.name, { pg: ['A', null, ['A', 'B'], 'D', 'E'], bs: ['B', null], mj: ['C', 'B'] })

    await openGrade(page, ctx)
    await page.locator('input[type=file]').setInputFiles([
      { name: 'satu.png', mimeType: 'image/png', buffer: first },
      { name: 'dua.png', mimeType: 'image/png', buffer: other }
    ])
    await expect(page.getByText(`${ctx.student.name}: 100`)).toBeVisible({ timeout: 45_000 })
    // PG 3/5 x 70 = 42, B/S 1/2 x 20 = 10, MJ 1/2 x 10 = 5 -> 57
    await expect(page.getByText(`${second.name}: 57`)).toBeVisible({ timeout: 45_000 })

    const results = (await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data
    const row = results.find((r) => r.student_id === second.id)
    expect(row.detail.pg).toEqual({ correct: 3, wrong: 0, empty: 1, double: 1 })
    expect(row.detail.bs).toEqual({ correct: 1, wrong: 0, empty: 1, double: 0 })
    expect(row.detail.mj).toEqual({ correct: 1, wrong: 1, empty: 0, double: 0 })
  })

  test('a sheet from another exam is refused', async ({ page, request }) => {
    const ctx = await scenario(request)
    const otherExam = await createExam(ctx.api, ctx.klass.id)
    await loginAs(page, ctx.token)
    const png = await photographSheet(page, otherExam, ctx.student.name, { pg: ['A'] })

    await openGrade(page, ctx)
    await page.locator('input[type=file]').setInputFiles({ name: 'salah-ujian.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByText('gagal: lembar ini untuk ujian lain')).toBeVisible({ timeout: 30_000 })
    expect((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.total).toBe(0)
  })

  test('a sheet printed before the number of questions changed is refused', async ({ page, request }) => {
    const ctx = await scenario(request)
    await loginAs(page, ctx.token)
    const png = await photographSheet(page, ctx.exam, ctx.student.name, { pg: ['A', 'B', 'C', 'D', 'E'] })

    const extended = { ...ctx.exam.answer_key, pg: [...ctx.exam.answer_key.pg, { no: 6, answer: 'A' }] }
    expect((await ctx.api.put(`/exams/${ctx.exam.id}`, { answer_key: extended })).status).toBe(200)

    await openGrade(page, ctx)
    await page.locator('input[type=file]').setInputFiles({ name: 'lama.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByText(/gagal: lembar template tidak terbaca/)).toBeVisible({ timeout: 30_000 })
    expect((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.total).toBe(0)
  })

  test('a blank photocopied sheet needs a student chosen first', async ({ page, request }) => {
    const ctx = await scenario(request)
    await loginAs(page, ctx.token)
    await page.goto(`/exams/${ctx.exam.id}/sheet`)
    const blank = await page.locator('.sheet').screenshot({ type: 'png' })

    await openGrade(page, ctx)
    await page.locator('input[type=file]').setInputFiles({ name: 'kosong.png', mimeType: 'image/png', buffer: blank })
    await expect(page.getByText('gagal: lembar kosong tanpa nama. Pilih siswa dulu, lalu unggah satu foto.')).toBeVisible({ timeout: 30_000 })

    await pickStudent(page).selectOption({ label: `${ctx.student.name} — belum dinilai` })
    await page.locator('input[type=file]').setInputFiles({ name: 'kosong.png', mimeType: 'image/png', buffer: blank })
    await expect(page.getByText(`${ctx.student.name}: 0`)).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('photos that are not the template', () => {
  // Plain gray PNG, 64x64, generated in the browser so no binary lives in the repo
  const grayPng = (page) =>
    page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#888'
      ctx.fillRect(0, 0, 64, 64)
      return canvas.toDataURL('image/png').split(',')[1]
    })

  test('several photos: refused with advice, nothing saved', async ({ page, request }) => {
    const ctx = await scenario(request)
    await openGrade(page, ctx)
    const buffer = Buffer.from(await grayPng(page), 'base64')
    await page.locator('input[type=file]').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer },
      { name: 'b.png', mimeType: 'image/png', buffer }
    ])
    await expect(page.getByText(/gagal: lembar template tidak terbaca/)).toHaveCount(2, { timeout: 30_000 })
    expect((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.total).toBe(0)
  })

  test('one photo with a student chosen goes to the (stubbed) AI', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const student = await createStudent(api, klass.id)
    const exam = await createExam(api, klass.id, {
      answer_key: { pg: ['A', 'B', 'C'].map((answer, i) => ({ no: i + 1, answer })), bs: [], mj: [] }
    })
    await openGrade(page, { token, klass, exam })
    await pickStudent(page).selectOption({ label: `${student.name} — belum dinilai` })
    const buffer = Buffer.from(await grayPng(page), 'base64')
    await page.locator('input[type=file]').setInputFiles({ name: 'foto-hp.png', mimeType: 'image/png', buffer })

    // Stub reads A, B, E: 2 of 3 -> 67
    await expect(page.getByText(`${student.name}: 67`)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Sumber: AI · foto baik')).toBeVisible()
    expect((await api.get(`/exams/${exam.id}/results`)).body.data[0].sheet_quality).toBe('good')
  })
})
