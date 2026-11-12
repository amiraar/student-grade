// The teacher's way through the app: nothing lost, nothing hidden, every mistake can be fixed.
import { test, expect, loginAs, selectWithOption } from './fixtures.js'
import { answers, createClass, createExam, createStudent, newTeacher, scenario } from '../helpers.js'
import { BUBBLE_RADIUS, buildLayout, countsFromKey } from '../../../frontend/src/lib/sheet.js'

const pickStudent = (page) => selectWithOption(page, 'Pilih siswa untuk diperiksa')
const quickBox = (page) => page.getByLabel('Ketik cepat jawaban Pilihan Ganda')
const cell = (page, no) => page.getByLabel(`Jawaban Pilihan Ganda nomor ${no}`)
const accept = (dialog) => dialog.accept()
const dismiss = (dialog) => dialog.dismiss()
// A /grade link loads class, exam, lists and results in turn, which takes longer than one list
const LINK_LOADED = { timeout: 30_000 }

async function twoStudents(request) {
  const { api, token } = await newTeacher(request)
  const klass = await createClass(api)
  const first = await createStudent(api, klass.id, { name: 'A Pertama' })
  const second = await createStudent(api, klass.id, { name: 'B Kedua' })
  const exam = await createExam(api, klass.id)
  return { api, token, klass, first, second, exam }
}

async function openExam(page, ctx) {
  await loginAs(page, ctx.token)
  await page.goto(`/grade?exam=${ctx.exam.id}`)
  await expect(page.getByText(/Sudah dinilai:/)).toBeVisible(LINK_LOADED)
}

test.describe('unsaved answers', () => {
  test('next student asks first; cancelling keeps the answers on screen', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await quickBox(page).fill('abcde')
    await expect(page.getByText('Nilai: 70 (C)')).toBeVisible()

    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      return dialog.dismiss()
    })
    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByRole('heading', { name: 'A Pertama' })).toBeVisible()
    await expect(page.getByText('Nilai: 70 (C)')).toBeVisible()
    await expect(pickStudent(page)).toHaveValue(String(ctx.first.id))
    expect(asked).toContain('A Pertama belum disimpan')

    page.once('dialog', accept)
    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByRole('heading', { name: 'B Kedua' })).toBeVisible()
    await expect(page.getByText('Nilai: 0 (E)')).toBeVisible()
  })

  test('cancelling a change in the dropdowns puts the selection back', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    const secondExam = await createExam(ctx.api, ctx.klass.id, { title: 'Ujian Lain' })
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await quickBox(page).fill('a')

    page.once('dialog', dismiss)
    await pickStudent(page).selectOption({ label: 'B Kedua — belum dinilai' })
    await expect(pickStudent(page)).toHaveValue(String(ctx.first.id))
    await expect(cell(page, 1)).toHaveValue('A')

    const examSelect = selectWithOption(page, '2. Pilih ujian')
    page.once('dialog', dismiss)
    await examSelect.selectOption({ label: `${secondExam.title} · ${secondExam.exam_date}` })
    await expect(examSelect).toHaveValue(String(ctx.exam.id))
    await expect(cell(page, 1)).toHaveValue('A')
  })

  test('leaving through the menu asks first', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await quickBox(page).fill('a')

    page.once('dialog', dismiss)
    await page.locator('header nav:visible').getByRole('link', { name: 'Kelas', exact: true }).click()
    await expect(page).toHaveURL(/\/grade/)
    await expect(cell(page, 1)).toHaveValue('A')

    page.once('dialog', accept)
    await page.locator('header nav:visible').getByRole('link', { name: 'Kelas', exact: true }).click()
    await expect(page).toHaveURL(/\/classes$/)
  })

  test('nothing is asked once the answers are saved', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await quickBox(page).fill('abcde')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()

    page.on('dialog', () => {
      throw new Error('saved answers must not ask')
    })
    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByRole('heading', { name: 'B Kedua' })).toBeVisible()
  })
})

test.describe('quick typing box', () => {
  test('shortening or clearing it takes those answers back', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })

    await quickBox(page).fill('abc')
    await expect(cell(page, 3)).toHaveValue('C')
    await quickBox(page).fill('ab')
    await expect(cell(page, 3)).toHaveValue('-')
    await quickBox(page).fill('')
    await expect(cell(page, 1)).toHaveValue('-')
    await expect(page.getByText('Nilai: 0 (E)')).toBeVisible()
  })

  test('on saved answers, clearing it goes back to what was saved', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.first.id, answers: { pg: answers('ABCDE') } })
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — 70' })

    await quickBox(page).fill('e')
    await expect(cell(page, 1)).toHaveValue('E')
    await expect(cell(page, 2)).toHaveValue('B')
    await quickBox(page).fill('')
    await expect(cell(page, 1)).toHaveValue('A')
    await expect(page.getByText(/belum disimpan/)).toBeHidden()
  })

  test('it is empty for the next student', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await quickBox(page).fill('abc')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()
    await expect(quickBox(page)).toHaveValue('')

    await page.getByRole('button', { name: /Siswa berikutnya/ }).click()
    await expect(page.getByRole('heading', { name: 'B Kedua' })).toBeVisible()
    await expect(quickBox(page)).toHaveValue('')
  })
})

test.describe('save status', () => {
  test('one status at a time, also when an edit keeps the score', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.first.id, answers: { pg: answers('BBBBB') } })
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — 14' })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Tersimpan.')).toBeVisible()

    // Wrong letter to another wrong letter: same score, still a change
    await cell(page, 1).fill('C')
    await expect(page.getByText('Ada perubahan, belum disimpan.')).toBeVisible()
    await expect(page.getByText('Tersimpan.')).toBeHidden()

    await cell(page, 1).fill('A')
    await expect(page.getByText(/^Berubah dari 14, belum disimpan\.$/)).toBeVisible()
    await expect(page.getByText('Tersimpan.')).toBeHidden()
  })
})

test('a letter outside the options is marked and cannot be saved', async ({ page, request }) => {
  const ctx = await twoStudents(request)
  await openExam(page, ctx)
  await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })

  const save = page.getByRole('button', { name: 'Simpan', exact: true })
  await cell(page, 1).fill('Z')
  await expect(page.getByText('Periksa Pilihan Ganda nomor 1. Pakai huruf A–E.')).toBeVisible()
  await expect(cell(page, 1)).toHaveAttribute('aria-invalid', 'true')
  await expect(save).toBeDisabled()

  await cell(page, 1).fill('!!')
  await expect(save).toBeEnabled()
  await cell(page, 1).fill('-')
  await expect(save).toBeEnabled()
  await cell(page, 1).fill('A')
  await expect(page.getByText(/Periksa Pilihan Ganda/)).toBeHidden()
  await expect(save).toBeEnabled()
})

test.describe('a photo and a saved score', () => {
  async function photo(page, exam, student, marks) {
    await page.goto(`/exams/${exam.id}/sheet?student=all`)
    const sheet = page.locator('.sheet').filter({ hasText: student.name })
    // The page waits for three requests in a row (session, exam, students) before drawing the sheets
    await expect(sheet).toBeVisible(LINK_LOADED)
    const dots = buildLayout(countsFromKey(exam.answer_key)).sections.flatMap((section) =>
      section.questions.flatMap((question) => {
        const chosen = marks[section.key]?.[question.no - 1]
        return chosen ? [question.bubbles.find((bubble) => bubble.option === chosen)] : []
      })
    )
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

  test('step 3 shows both scores: keep leaves it, replace saves it', async ({ page, request }) => {
    const ctx = await scenario(request)
    await loginAs(page, ctx.token)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    const png = await photo(page, ctx.exam, ctx.student, { pg: ['A', 'B', 'C', 'D', 'A'], bs: ['B', 'B'], mj: ['A', 'B'] })
    const upload = () => page.getByLabel('Foto lembar template').setInputFiles({ name: 'ulang.png', mimeType: 'image/png', buffer: png })
    const savedScore = async () => Number((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data[0].score)

    await page.goto(`/grade?exam=${ctx.exam.id}`)
    await expect(page.getByText(/Sudah dinilai:/)).toBeVisible(LINK_LOADED)
    await upload()
    await expect(page.getByText(`${ctx.student.name} sudah punya nilai 100; foto ini 76.`)).toBeVisible({ timeout: 30_000 })
    expect(await savedScore()).toBe(100)

    await page.getByRole('button', { name: 'Biarkan' }).click()
    await expect(page.getByText('nilai lama tetap dipakai')).toBeVisible()
    expect(await savedScore()).toBe(100)

    await upload()
    await expect(page.getByText(`${ctx.student.name} sudah punya nilai 100; foto ini 76.`)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Ganti' }).click()
    await expect(page.getByText(`${ctx.student.name}: 76`)).toBeVisible()
    expect(await savedScore()).toBe(76)
  })

  test('the student card asks before replacing and refuses another student\'s sheet', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await loginAs(page, ctx.token)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.first.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    const secondSheet = await photo(page, ctx.exam, ctx.second, { pg: ['A'] })
    const firstSheet = await photo(page, ctx.exam, ctx.first, { pg: ['A'] })

    await page.goto(`/grade?exam=${ctx.exam.id}&student=${ctx.first.id}`)
    const input = page.getByLabel('Unggah foto untuk A Pertama')
    await expect(input).toBeVisible(LINK_LOADED)

    page.once('dialog', dismiss)
    await input.setInputFiles({ name: 'batal.png', mimeType: 'image/png', buffer: firstSheet })
    await expect(page.getByText('Nilai: 100 (A)')).toBeVisible()

    page.once('dialog', accept)
    await input.setInputFiles({ name: 'orang-lain.png', mimeType: 'image/png', buffer: secondSheet })
    await expect(page.getByText('Gagal: lembar ini milik B Kedua. Unggah di langkah 3.')).toBeVisible({ timeout: 30_000 })
    expect(Number((await ctx.api.get(`/exams/${ctx.exam.id}/results`)).body.data[0].score)).toBe(100)
  })
})

test.describe('exam detail warnings', () => {
  test('recalculating saved scores asks first; cancelling changes nothing', async ({ page, request }) => {
    const { api, token, student, exam } = await scenario(request)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE'), bs: answers('BS'), mj: answers('AB') } })
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}`)

    await page.getByLabel(/Kunci Pilihan Ganda/).fill('ABCDA')
    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      return dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click()
    await expect.poll(() => asked).toBe('1 nilai siswa akan dihitung ulang. Lanjutkan?')
    expect((await api.get(`/exams/${exam.id}`)).body.answer_key.pg[4].answer).toBe('E')
  })

  test('a changed title does not ask', async ({ page, request }) => {
    const { api, token, student, exam } = await scenario(request)
    await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers('ABCDE') } })
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}`)
    page.on('dialog', () => {
      throw new Error('a title change must not ask')
    })
    await page.getByPlaceholder('Judul').fill('Judul Baru')
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click()
    await expect(page.getByRole('heading', { name: 'Judul Baru' })).toBeVisible()
  })

  test('a changed number of questions warns about printed sheets', async ({ page, request }) => {
    const { token, exam } = await scenario(request)
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}`)
    const warning = page.getByText(/Jumlah soal berubah/)
    await expect(page.getByLabel(/Kunci Pilihan Ganda/)).toBeVisible()
    await expect(warning).toBeHidden()

    await page.getByLabel(/Kunci Pilihan Ganda/).fill('ABCDEA')
    await expect(warning).toBeVisible()
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('EDCBA')
    await expect(warning).toBeHidden()
  })
})

test.describe('whole lists', () => {
  test('all 25 results of a class are on the page, lowest score included', async ({ page, request }) => {
    test.slow() // sets up 25 students and their scores
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const exam = await createExam(api, klass.id)
    for (let i = 1; i <= 25; i++) {
      const student = await createStudent(api, klass.id, { name: `Murid ${String(i).padStart(2, '0')}` })
      // The last student scores lowest
      await api.post('/grade', { exam_id: exam.id, student_id: student.id, answers: { pg: answers(i === 25 ? 'EEEEB' : 'ABCDE') } })
    }
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}/results`)
    await expect(page.getByText(/^Nilai \d+/)).toHaveCount(25)
    await expect(page.getByText('Murid 25')).toBeVisible()
  })

  test('the students list pages through every student', async ({ page, request }) => {
    test.slow() // sets up 25 students
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    for (let i = 1; i <= 25; i++) await createStudent(api, klass.id, { name: `Murid ${String(i).padStart(2, '0')}` })
    await loginAs(page, token)
    await page.goto('/students')

    await expect(page.getByText('Halaman 1 dari 2 · 25 data')).toBeVisible()
    await expect(page.getByRole('button', { name: /Sebelumnya/ })).toBeDisabled()
    await expect(page.getByText(/^NIS: /)).toHaveCount(20)
    await page.getByRole('button', { name: /Berikutnya/ }).click()
    await expect(page.getByText('Halaman 2 dari 2 · 25 data')).toBeVisible()
    await expect(page.getByText(/^NIS: /)).toHaveCount(5)

    await page.getByPlaceholder('Cari nama / NIS').fill('Murid 01')
    await expect(page.getByText(/^NIS: /)).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Halaman daftar' })).toBeHidden()
  })

  test('results list who is not graded yet and each row opens for correction', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.first.id, answers: { pg: answers('ABCDE') } })
    await loginAs(page, ctx.token)
    await page.goto(`/exams/${ctx.exam.id}/results`)

    await expect(page.getByText(ctx.exam.title)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Belum dinilai (1)' })).toBeVisible()
    await page.getByPlaceholder('Cari siswa').fill('a pertama')
    await expect(page.getByRole('heading', { name: /Belum dinilai/ })).toBeHidden()
    await page.getByPlaceholder('Cari siswa').fill('')

    await page.getByRole('link', { name: 'B Kedua' }).click()
    await expect(page).toHaveURL(new RegExp(`/grade\\?exam=${ctx.exam.id}&student=${ctx.second.id}$`))
    await expect(page.getByRole('heading', { name: 'B Kedua' })).toBeVisible(LINK_LOADED)

    await page.goBack()
    await page.getByRole('link', { name: /A Pertama/ }).click()
    await expect(page.getByRole('heading', { name: 'A Pertama' })).toBeVisible(LINK_LOADED)
    await expect(cell(page, 1)).toHaveValue('A')
  })

  test('exam cards name the class', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const a = await createClass(api, { name: 'Kelas 7A' })
    const b = await createClass(api, { name: 'Kelas 7B' })
    await createExam(api, a.id, { title: 'Ulangan 1' })
    await createExam(api, b.id, { title: 'Ulangan 1' })
    await loginAs(page, token)
    await page.goto('/exams')
    await expect(page.getByRole('link', { name: /Ulangan 1/ }).filter({ hasText: 'Kelas 7A' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ulangan 1/ }).filter({ hasText: 'Kelas 7B' })).toBeVisible()
  })
})

test.describe('fixing mistakes', () => {
  test('edit a class, then delete it after cancelling once', async ({ page, request }) => {
    const { api, token, klass, student } = await scenario(request)
    await loginAs(page, token)
    await page.goto(`/classes/${klass.id}`)

    await page.getByRole('button', { name: 'Edit Kelas' }).click()
    await page.getByPlaceholder('Nama kelas').fill('Kelas Baru')
    await page.getByPlaceholder('Tahun ajaran').fill('2026/2027')
    await page.locator('select').selectOption({ label: 'Semester 2' })
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByRole('heading', { name: 'Kelas Baru' })).toBeVisible()
    await expect(page.getByText('2026/2027 · Semester 2')).toBeVisible()

    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      return dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Hapus Kelas' }).click()
    await expect.poll(() => asked).toContain('Semua siswa, ujian, dan nilai di kelas ini ikut terhapus')
    expect((await api.get(`/classes/${klass.id}`)).status).toBe(200)

    page.once('dialog', accept)
    await page.getByRole('button', { name: 'Hapus Kelas' }).click()
    await expect(page).toHaveURL(/\/classes$/)
    expect((await api.get(`/classes/${klass.id}`)).status).toBe(404)
    expect((await api.get(`/students/${student.id}`)).status).toBe(404)
  })

  test('edit a student, move to another class, then delete', async ({ page, request }) => {
    const { api, token, klass, student } = await scenario(request)
    const other = await createClass(api, { name: 'Kelas Tujuan' })
    await loginAs(page, token)
    await page.goto(`/students/${student.id}`)

    await page.getByRole('button', { name: 'Edit Siswa' }).click()
    await page.getByPlaceholder('Nama siswa').fill('Nama Benar')
    await page.getByPlaceholder('NIS').fill('NIS-BENAR')
    const note = page.getByText(/tidak muncul lagi di laporan kelas lama/)
    await expect(note).toBeHidden()
    await page.locator('select').selectOption({ label: 'Kelas Tujuan' })
    await expect(note).toBeVisible()
    await page.getByRole('button', { name: 'Simpan' }).click()

    await expect(page.getByRole('heading', { name: 'Nama Benar' })).toBeVisible()
    await expect(page.getByText('NIS: NIS-BENAR · Kelas Tujuan')).toBeVisible()
    expect(klass.id).not.toBe(other.id)

    page.once('dialog', accept)
    await page.getByRole('button', { name: 'Hapus Siswa' }).click()
    await expect(page).toHaveURL(/\/students$/)
    expect((await api.get(`/students/${student.id}`)).status).toBe(404)
  })

  test('delete an exam', async ({ page, request }) => {
    const { api, token, exam } = await scenario(request)
    await loginAs(page, token)
    await page.goto(`/exams/${exam.id}`)
    page.once('dialog', accept)
    await page.getByRole('button', { name: 'Hapus Ujian' }).click()
    await expect(page).toHaveURL(/\/exams$/)
    expect((await api.get(`/exams/${exam.id}`)).status).toBe(404)
  })

  test.describe('refused edits', () => {
    test.use({ allowedErrors: [/Failed to load resource/] })

    test('a duplicate NIS is explained and the form stays open', async ({ page, request }) => {
      const { api, token, klass, student } = await scenario(request)
      const taken = await createStudent(api, klass.id)
      await loginAs(page, token)
      await page.goto(`/students/${student.id}`)
      await page.getByRole('button', { name: 'Edit Siswa' }).click()
      await page.getByPlaceholder('NIS').fill(taken.nis)
      await page.getByRole('button', { name: 'Simpan' }).click()
      await expect(page.getByText('NIS sudah terdaftar')).toBeVisible()
      await expect(page.getByPlaceholder('NIS')).toBeVisible()
    })

    test('form messages name what is missing', async ({ page, request }) => {
      const { api, token } = await newTeacher(request)
      await createClass(api)
      await loginAs(page, token)
      await page.goto('/students')
      await page.getByRole('button', { name: 'Simpan' }).click()
      await expect(page.getByText('Kelas, nama, dan NIS wajib diisi')).toBeVisible()
      await page.getByPlaceholder('Tempel CSV di sini').fill('Nama;NIS\nA;1\n')
      await page.getByRole('button', { name: 'Import' }).click()
      await expect(page.getByText('Pilih kelas tujuan', { exact: true }).last()).toBeVisible()

      await page.goto('/exams')
      await page.getByRole('button', { name: 'Simpan Ujian' }).click()
      await expect(page.getByText('Lengkapi: kelas, judul, mata pelajaran, tanggal ujian')).toBeVisible()
    })
  })

  test('empty fields in an edit form are refused, not silently ignored', async ({ page, request }) => {
    const { token, student } = await scenario(request)
    await loginAs(page, token)
    await page.goto(`/students/${student.id}`)
    await page.getByRole('button', { name: 'Edit Siswa' }).click()
    await page.getByPlaceholder('Nama siswa').fill('  ')
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText('Nama dan NIS wajib diisi.')).toBeVisible()
  })
})

test.describe('guidance', () => {
  test('a new teacher sees the steps and each empty form says what comes first', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    await loginAs(page, token)
    await page.goto('/')
    const steps = page.getByRole('list').filter({ hasText: 'Buat kelas' }).getByRole('link')
    await expect(steps).toHaveCount(4)
    await expect(page.getByText('Sudah ada')).toHaveCount(0)

    for (const path of ['/exams', '/students', '/grade']) {
      await page.goto(path)
      await expect(page.getByText(/Belum ada kelas\. Buat dulu di menu/), path).toBeVisible()
    }

    const klass = await createClass(api)
    await page.goto('/')
    await expect(page.getByText('Sudah ada')).toHaveCount(1)
    await createStudent(api, klass.id)
    await createExam(api, klass.id)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ujian Terbaru' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mulai dari sini' })).toBeHidden()
  })

  test('saving an exam offers printing and correcting it', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    await createStudent(api, klass.id, { name: 'Murid Satu' })
    await loginAs(page, token)
    await page.goto('/exams')

    await page.getByRole('button', { name: 'Buat Ujian' }).click()
    await expect(selectWithOption(page, 'Pilih kelas').last()).toBeFocused()
    await selectWithOption(page, 'Pilih kelas').last().selectOption({ label: klass.name })
    await page.getByPlaceholder('Judul ujian').fill('Ujian Baru')
    await page.getByPlaceholder('Mata pelajaran').last().fill('IPA')
    await page.locator('input[type=date]').fill('2026-05-01')
    await page.getByLabel(/Kunci Pilihan Ganda/).fill('AB')
    await page.getByRole('button', { name: 'Simpan Ujian' }).click()

    await expect(page.getByRole('link', { name: 'Cetak lembar jawaban' })).toBeVisible()
    await page.getByRole('link', { name: 'Mulai koreksi' }).click()
    await expect(selectWithOption(page, '1. Pilih kelas')).toHaveValue(String(klass.id), LINK_LOADED)
    await expect(pickStudent(page)).toBeVisible(LINK_LOADED)
    await expect(page.getByText('Sudah dinilai: 0 dari 1 siswa').or(page.getByText(/Sudah dinilai:\s*0\s*dari 1/))).toBeVisible()
  })

  test('a class without students: grading says so and the print button is off', async ({ page, request }) => {
    const { api, token } = await newTeacher(request)
    const klass = await createClass(api)
    const exam = await createExam(api, klass.id)
    await loginAs(page, token)

    await page.goto(`/grade?exam=${exam.id}`)
    await expect(page.getByText(/Kelas ini belum punya siswa\. Tambah dulu di menu/)).toBeVisible(LINK_LOADED)

    await page.goto(`/exams/${exam.id}/sheet?student=all`)
    await expect(page.getByText(/Kelas ini belum punya siswa/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cetak' })).toBeDisabled()

    await page.getByRole('checkbox').uncheck()
    await expect(page.locator('.sheet')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Cetak' })).toBeEnabled()
  })

  test('grade boundaries are shown', async ({ page, request }) => {
    const ctx = await twoStudents(request)
    await openExam(page, ctx)
    await pickStudent(page).selectOption({ label: 'A Pertama — belum dinilai' })
    await expect(page.getByText('Grade: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, E < 60')).toBeVisible()
  })
})
