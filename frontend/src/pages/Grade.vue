<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import api, { errorMessage as getError } from '../lib/api.js'
import { ANSWER_HELP } from '../lib/answerKey.js'
import { latestRequest } from '../lib/latest.js'
import { countsFromKey } from '../lib/sheet.js'
import { fileToGray, readSheet } from '../lib/omr.js'
// Same scoring code as the server, for the live score while typing
import { GRADE_RULES_TEXT, scoreAnswers } from '../../../lib/scoring.js'
// Same rules as the server's answer key, so a letter that cannot be on the sheet is caught here
import { rules } from '../../../lib/validate.js'

const SECTIONS = { pg: 'Pilihan Ganda', bs: 'Benar/Salah', mj: 'Menjodohkan' }
const SOURCE = { template: 'Lembar template (tanpa AI)', manual: 'Input manual', good: 'AI · foto baik', low_contrast: 'AI · kontras rendah', blurry: 'AI · buram', tilted: 'AI · miring' }
const STATUS_CLASS = {
  correct: 'bg-emerald-50 text-emerald-800',
  wrong: 'bg-red-50 text-red-800',
  empty: 'bg-slate-50 text-slate-500',
  double: 'bg-amber-50 text-amber-800'
}

const route = useRoute()
const classes = ref([])
const classesLoaded = ref(false)
const students = ref([])
const exams = ref([])
// False until the exams of the chosen class have arrived, so "no exams" is not said while loading
const examsLoaded = ref(false)
const exam = ref(null) // selected exam with answer key
const results = ref({}) // student_id -> saved result
const classId = ref('')
const examId = ref('')
const studentId = ref('')
const fileInput = ref(null)
const busy = ref('')
const errorMessage = ref('')
const batch = ref([]) // one row per uploaded photo
const review = ref(null) // { studentId, items, quick, snapshot, score, grade, source, saved }
// From a link such as /grade?exam=1&student=2: applied once the lists they belong to are loaded
const linked = { exam: null, student: null }

const studentName = (id) => students.value.find((s) => s.id === id)?.name || `Siswa #${id}`
const gradedCount = computed(() => students.value.filter((s) => results.value[s.id]).length)
const cleanAnswer = (answer) => String(answer || '-').trim().toUpperCase() || '-'
const reviewAnswers = (items) =>
  Object.fromEntries(Object.keys(SECTIONS).map((sec) => [sec, items[sec].map((item) => ({ no: item.no, jawaban: cleanAnswer(item.answer) }))]))
const preview = computed(() => (review.value && exam.value ? scoreAnswers(reviewAnswers(review.value.items), exam.value.answer_key, exam.value.weights) : null))
const totalQuestions = computed(() => (review.value ? Object.values(review.value.items).flat().length : 0))
const flaggedCount = computed(() => (review.value ? Object.values(review.value.items).flat().filter((i) => i.ragu).length : 0))
const isDirty = computed(() => Boolean(review.value) && JSON.stringify(reviewAnswers(review.value.items)) !== review.value.snapshot)

const isAllowed = (sec, answer) => {
  const value = cleanAnswer(answer)
  return value === '-' || value === '!!' || rules[sec].test(value)
}
const wrongAnswers = computed(() => {
  if (!review.value) return []
  return Object.keys(SECTIONS).flatMap((sec) => {
    const numbers = review.value.items[sec].filter((item) => !isAllowed(sec, item.answer)).map((item) => item.no)
    return numbers.length ? [`Periksa ${SECTIONS[sec]} nomor ${numbers.join(', ')}. ${ANSWER_HELP[sec]}`] : []
  })
})

const saveStatus = computed(() => {
  const r = review.value
  if (!r || !preview.value) return null
  if (r.score === null) return { unsaved: true, text: 'Belum disimpan. Isi jawaban siswa lalu klik Simpan.' }
  if (preview.value.score !== r.score) return { unsaved: true, text: `Berubah dari ${r.score}, belum disimpan.` }
  if (isDirty.value) return { unsaved: true, text: 'Ada perubahan, belum disimpan.' }
  return r.saved ? { unsaved: false, text: 'Tersimpan.' } : null
})

const okToLeave = () => !isDirty.value || window.confirm(`Jawaban ${studentName(review.value.studentId)} belum disimpan. Pindah tanpa menyimpan?`)

// Changing a selection asks first when answers are unsaved; cancelling puts the selection back.
// The selection is put back after the tick, once the dropdown accepts a new value from the page.
function guardedWatch(source, onChange) {
  let reverting = false
  watch(source, (value, old) => {
    if (reverting) {
      reverting = false
      return
    }
    if (!okToLeave()) {
      nextTick(() => {
        reverting = true
        source.value = old
      })
      return
    }
    // The answers were given up, so the selections that follow do not ask again
    if (isDirty.value) review.value = null
    onChange(value)
  })
}

const warnBeforeUnload = (event) => {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => okToLeave())
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

onMounted(async () => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
  classesLoaded.value = true

  const examFromLink = Number(route.query.exam)
  if (!examFromLink) return
  try {
    const examRes = await api.get(`/exams/${examFromLink}`)
    linked.exam = examRes.data.id
    linked.student = Number(route.query.student) || null
    classId.value = examRes.data.class_id
  } catch (err) {
    errorMessage.value = getError(err, 'Ujian tidak ditemukan.')
  }
})

const trackClass = latestRequest()
guardedWatch(classId, async () => {
  const isNewest = trackClass()
  examId.value = ''
  students.value = []
  exams.value = []
  examsLoaded.value = false
  if (!classId.value) return
  const [studentsRes, examsRes] = await Promise.all([
    api.get('/students', { params: { class_id: classId.value, per_page: 200, sort: 'name', order: 'asc' } }),
    api.get('/exams', { params: { class_id: classId.value, per_page: 200 } })
  ])
  if (!isNewest()) return
  students.value = studentsRes.data.data
  exams.value = examsRes.data.data
  examsLoaded.value = true
  if (linked.exam) {
    examId.value = linked.exam
    linked.exam = null
  }
})

const trackExam = latestRequest()
guardedWatch(examId, async () => {
  const isNewest = trackExam()
  exam.value = null
  results.value = {}
  studentId.value = ''
  batch.value = []
  review.value = null
  if (!examId.value) return
  const [examRes, resultsRes] = await Promise.all([
    api.get(`/exams/${examId.value}`),
    api.get(`/exams/${examId.value}/results`, { params: { per_page: 200 } })
  ])
  if (!isNewest()) return
  exam.value = examRes.data
  results.value = Object.fromEntries(resultsRes.data.data.map((r) => [r.student_id, r]))
  if (linked.student && students.value.some((s) => s.id === linked.student)) studentId.value = linked.student
  linked.student = null
})

// Selecting a student opens their saved answers (or an empty table) for checking / manual input
guardedWatch(studentId, (id) => {
  errorMessage.value = ''
  if (!id) {
    review.value = null
    return
  }
  openStudent(id)
})

function openStudent(id, extra = {}) {
  const saved = results.value[id]
  openReview(id, saved?.answers || {}, { ...(saved ? { score: Number(saved.score), grade: saved.grade, source: saved.sheet_quality } : {}), ...extra })
}

// Editable answer table; colours and score come from `preview`
function openReview(id, answers, extra) {
  const items = {}
  for (const sec of Object.keys(SECTIONS)) {
    items[sec] = (exam.value.answer_key?.[sec] || [])
      .filter((k) => k.answer)
      .map((k) => {
        const a = (answers[sec] || []).find((x) => Number(x.no) === Number(k.no))
        const answer = String(a?.jawaban ?? '-').trim().toUpperCase() || '-'
        return { no: Number(k.no), key: k.answer, answer, opened: answer, ragu: Boolean(a?.ragu) }
      })
  }
  review.value = { studentId: id, items, quick: { pg: '', bs: '', mj: '' }, snapshot: JSON.stringify(reviewAnswers(items)), score: null, grade: null, source: null, saved: false, ...extra }
}

const remember = (id, data) => {
  results.value = { ...results.value, [id]: { student_id: id, score: data.score, grade: data.grade, answers: data.answers, sheet_quality: data.sheet_quality } }
}

async function save(id, answers, payload = {}) {
  const res = await api.post('/grade', { exam_id: examId.value, student_id: id, answers, ...payload })
  remember(id, res.data)
  return res.data
}

// A photo read while a student is open may have changed that student's score
const refreshOpenStudent = () => {
  if (review.value && !isDirty.value) openStudent(review.value.studentId)
}

// Photos of the printed template: read in the browser, student found from the printed ID.
// A photo never replaces a saved score by itself: the teacher sees both scores and chooses.
async function handleFiles(event) {
  const files = [...event.target.files]
  errorMessage.value = ''
  if (!okToLeave()) {
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  if (isDirty.value) openStudent(review.value.studentId)
  batch.value = files.map((file) => ({ name: file.name, status: 'menunggu' }))
  const counts = countsFromKey(exam.value.answer_key)
  for (const [i, file] of files.entries()) {
    const row = batch.value[i]
    busy.value = `Membaca foto ${i + 1} dari ${files.length}...`
    try {
      const { gray, w, h } = await fileToGray(file)
      const sheet = readSheet(gray, w, h, counts)
      if (!sheet) {
        row.status = 'gagal: lembar template tidak terbaca. Foto ulang: seluruh lembar & 4 kotak hitam terlihat. Jika jumlah soal diubah setelah dicetak, cetak ulang lembarnya. Untuk lembar lain, pilih siswa di langkah 4 lalu unggah di kartu siswa.'
        continue
      }
      if (sheet.id.examId !== Number(examId.value)) {
        row.status = 'gagal: lembar ini untuk ujian lain'
        continue
      }
      const id = sheet.id.studentId
      if (!id) {
        row.status = 'gagal: lembar kosong tanpa nama. Pilih siswa di langkah 4, lalu unggah di kartu siswa.'
        continue
      }
      if (!students.value.some((s) => s.id === id)) {
        row.status = 'gagal: siswa di lembar ini tidak ada di kelas'
        continue
      }
      const flagged = Object.values(sheet.answers).flat().filter((a) => a.ragu).length
      const saved = results.value[id]
      if (saved) {
        const { score } = scoreAnswers(sheet.answers, exam.value.answer_key, exam.value.weights)
        Object.assign(row, { status: 'pilih', studentId: id, answers: sheet.answers, flagged, oldScore: Number(saved.score), newScore: score })
        continue
      }
      const data = await save(id, sheet.answers, { source: 'template' })
      Object.assign(row, { status: 'ok', studentId: id, score: data.score, flagged, source: 'template' })
    } catch (err) {
      row.status = `gagal: ${err.response ? getError(err) : err.message}`
    }
  }
  busy.value = ''
  if (fileInput.value) fileInput.value.value = ''
  // With one photo, open it directly for checking
  const done = batch.value.filter((r) => r.status === 'ok')
  if (files.length === 1 && done.length) showStudent(done[0].studentId)
  else refreshOpenStudent()
}

async function replaceWithPhoto(row) {
  busy.value = 'Menyimpan...'
  try {
    const data = await save(row.studentId, row.answers, { source: 'template' })
    Object.assign(row, { status: 'ok', score: data.score, source: 'template' })
    if (batch.value.length === 1) showStudent(row.studentId)
    else refreshOpenStudent()
  } catch (err) {
    row.status = `gagal: ${err.response ? getError(err) : err.message}`
  } finally {
    busy.value = ''
  }
}

// A photo for the student whose card is open: a blank template sheet, or any other sheet (read by AI)
async function handleStudentPhoto(event) {
  const input = event.target
  const [file] = input.files
  const id = review.value.studentId
  const saved = results.value[id]
  errorMessage.value = ''
  if (!file || !okToLeave() || (saved && !window.confirm(`${studentName(id)} sudah punya nilai ${Number(saved.score)}. Ganti dengan hasil foto ini?`))) {
    input.value = ''
    return
  }
  busy.value = 'Membaca foto...'
  try {
    const { gray, w, h } = await fileToGray(file)
    const sheet = readSheet(gray, w, h, countsFromKey(exam.value.answer_key))
    if (sheet) {
      if (sheet.id.examId !== Number(examId.value)) throw new Error('lembar ini untuk ujian lain.')
      if (sheet.id.studentId && sheet.id.studentId !== id) throw new Error(`lembar ini milik ${studentName(sheet.id.studentId)}. Unggah di langkah 3.`)
      await save(id, sheet.answers, { source: 'template' })
    } else {
      busy.value = 'Bukan lembar template, dibaca AI...'
      await gradeWithAi(file, id)
    }
    openStudent(id, { saved: true })
  } catch (err) {
    errorMessage.value = `Gagal: ${err.response ? getError(err) : err.message}`
  } finally {
    busy.value = ''
    input.value = ''
  }
}

// Phone photos are often > 4 MB (over the Vercel request limit): shrink before sending
const compressImage = (file, maxSize = 2000) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = () => reject(new Error('File bukan gambar yang bisa dibaca. Gunakan JPG/PNG.'))
    img.src = URL.createObjectURL(file)
  })

async function gradeWithAi(file, id) {
  const image = await compressImage(file)
  const res = await api.post('/grade', { exam_id: examId.value, student_id: id, image })
  remember(id, res.data)
  return res.data
}

function showStudent(id) {
  if (studentId.value !== id) studentId.value = id
  else if (okToLeave()) openStudent(id)
}

async function saveReview() {
  const r = review.value
  // A teacher-checked answer is no longer "ragu"
  const answers = reviewAnswers(r.items)
  busy.value = 'Menyimpan...'
  errorMessage.value = ''
  try {
    const data = await save(r.studentId, answers)
    openReview(r.studentId, data.answers, { score: data.score, grade: data.grade, source: data.sheet_quality, saved: true })
  } catch (err) {
    errorMessage.value = getError(err, 'Gagal menyimpan.')
  } finally {
    busy.value = ''
  }
}

// Type a whole section at once, e.g. "ABCDA-B" or "A B C" ("-" empty, "!!" double).
// A question the text no longer reaches goes back to the answer it had when the student was opened.
function quickFill(sec, text) {
  review.value.quick[sec] = text
  const tokens = text.toUpperCase().match(/!!|[A-Z]|-/g) || []
  review.value.items[sec].forEach((item, i) => {
    item.answer = tokens[i] ?? item.opened
  })
}

function nextStudent() {
  const list = students.value
  const index = list.findIndex((s) => s.id === studentId.value)
  const next = [...list.slice(index + 1), ...list.slice(0, index + 1)].find((s) => !results.value[s.id])
  if (next) studentId.value = next.id
  else errorMessage.value = 'Semua siswa di kelas ini sudah dinilai.'
}
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
      <h1 class="section-title mb-4">Koreksi Lembar Jawaban</h1>
      <p v-if="classesLoaded && !classes.length" class="mb-3 text-sm text-amber-700">
        Belum ada kelas. Buat dulu di menu <RouterLink to="/classes" class="font-semibold underline">Kelas</RouterLink>.
      </p>
      <div class="grid gap-3 md:grid-cols-2">
        <select v-model="classId" class="input">
          <option value="">1. Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="examId" class="input" :disabled="!classId">
          <option value="">2. Pilih ujian</option>
          <option v-for="item in exams" :key="item.id" :value="item.id">{{ item.title }} · {{ item.exam_date }}</option>
        </select>
      </div>
      <p v-if="classId && examsLoaded && !exams.length" class="mt-2 text-sm text-amber-700">Kelas ini belum punya ujian. Buat ujian dulu di menu Ujian.</p>
      <p v-if="errorMessage && !review" class="mt-2 text-sm text-red-600">{{ errorMessage }}</p>

      <div v-if="exam" class="mt-4 space-y-3">
        <p v-if="!students.length" class="text-sm text-amber-700">
          Kelas ini belum punya siswa. Tambah dulu di menu <RouterLink to="/students" class="font-semibold underline">Siswa</RouterLink>.
        </p>
        <div class="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Sudah dinilai: <b>{{ gradedCount }}</b> dari {{ students.length }} siswa</p>
          <RouterLink :to="`/exams/${exam.id}/sheet?student=all`" class="btn-ghost">Cetak lembar jawaban</RouterLink>
        </div>

        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="mb-2 font-semibold">3. Foto lembar template</p>
          <input ref="fileInput" type="file" accept="image/*" multiple class="input" :disabled="Boolean(busy)" aria-label="Foto lembar template" @change="handleFiles" />
          <p class="mt-2 text-xs text-slate-500">
            Lembar dari aplikasi: boleh pilih banyak foto sekaligus, siswa dikenali otomatis, dibaca tanpa AI.
            Lembar kosong atau lembar lain: pilih siswa di langkah 4, lalu unggah di kartu siswa.
          </p>
          <p v-if="busy" class="mt-2 text-sm text-slate-700">{{ busy }}</p>
          <ul v-if="batch.length" class="mt-3 divide-y divide-slate-100 text-sm">
            <li v-for="row in batch" :key="row.name" class="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span class="break-all text-slate-500">{{ row.name }}</span>
              <span v-if="row.status === 'ok'" class="flex flex-wrap items-center gap-2">
                <b>{{ studentName(row.studentId) }}: {{ row.score }}</b>
                <span v-if="row.flagged" class="rounded-full bg-amber-100 px-2 text-amber-800">{{ row.flagged }} perlu dicek</span>
                <button class="btn-ghost" @click="showStudent(row.studentId)">Periksa</button>
              </span>
              <span v-else-if="row.status === 'pilih'" class="flex flex-wrap items-center gap-2">
                <span class="text-amber-800">{{ studentName(row.studentId) }} sudah punya nilai {{ row.oldScore }}; foto ini {{ row.newScore }}.</span>
                <button class="btn-ghost" :disabled="Boolean(busy)" @click="replaceWithPhoto(row)">Ganti</button>
                <button class="btn-ghost" :disabled="Boolean(busy)" @click="row.status = 'nilai lama tetap dipakai'">Biarkan</button>
              </span>
              <span v-else :class="row.status.startsWith('gagal') ? 'text-red-600' : 'text-slate-600'">{{ row.status }}</span>
            </li>
          </ul>
        </div>

        <select v-model="studentId" class="input">
          <option value="">4. Pilih siswa untuk diperiksa / diisi manual</option>
          <option v-for="item in students" :key="item.id" :value="item.id">
            {{ item.name }}{{ results[item.id] ? ` — ${Number(results[item.id].score)}` : ' — belum dinilai' }}
          </option>
        </select>
      </div>
    </section>

    <section v-if="review" class="card p-4 md:p-8">
      <h2 class="text-xl font-semibold">{{ studentName(review.studentId) }}</h2>
      <p class="text-2xl font-semibold">Nilai: {{ preview.score }} ({{ preview.grade }})</p>
      <p class="text-sm text-slate-600">Benar {{ preview.correct }} dari {{ totalQuestions }} soal</p>
      <p class="text-xs text-slate-500">{{ GRADE_RULES_TEXT }}</p>
      <p v-if="review.source" class="text-xs text-slate-500">Sumber: {{ SOURCE[review.source] || review.source }}</p>
      <p v-if="flaggedCount" class="mt-1 text-sm text-amber-800">
        {{ flaggedCount }} jawaban ditandai <b>?</b> (tanda tipis / terhapus / ganda). Cocokkan dengan kertasnya.
      </p>

      <div class="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
        <label class="block text-sm font-semibold text-slate-700">
          Foto lembar kosong atau lembar lain
          <span class="mb-2 block text-xs font-normal text-slate-500">Satu foto. Nilainya disimpan untuk siswa ini. Lembar selain template dibaca AI.</span>
          <input type="file" accept="image/*" class="input font-normal" :disabled="Boolean(busy)" :aria-label="`Unggah foto untuk ${studentName(review.studentId)}`" @change="handleStudentPhoto" />
        </label>
      </div>

      <p class="mt-4 text-xs text-slate-500">Isi "-" untuk kosong, "!!" untuk jawaban ganda.</p>
      <div class="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="(label, sec) in SECTIONS" :key="sec" v-show="review.items[sec]?.length">
          <h3 class="mb-2 font-semibold">
            {{ label }}
            <span class="text-sm font-normal text-slate-500">({{ preview.detail[sec].correct }}/{{ review.items[sec].length }} benar)</span>
          </h3>
          <input class="input mb-2" :value="review.quick[sec]" :placeholder="`Ketik cepat, mis. ${sec === 'bs' ? 'BSSB-B' : 'ABCDA-B'}`" :aria-label="`Ketik cepat jawaban ${label}`" @input="quickFill(sec, $event.target.value)" />
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="px-2 py-1">No</th>
                <th>Kunci</th>
                <th>Jawaban</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in review.items[sec]" :key="item.no" :class="[STATUS_CLASS[preview.items[sec][i].status], item.ragu ? 'outline outline-2 -outline-offset-2 outline-amber-400' : '']">
                <td class="px-2 py-1">{{ item.no }}</td>
                <td class="font-semibold">{{ item.key }}</td>
                <td class="py-1">
                  <input
                    v-model="item.answer"
                    maxlength="2"
                    class="w-16 rounded-lg border bg-white px-2 py-1 text-base uppercase md:text-sm"
                    :class="isAllowed(sec, item.answer) ? 'border-slate-200' : 'border-red-500 ring-1 ring-red-500'"
                    :aria-invalid="!isAllowed(sec, item.answer)"
                    :aria-label="`Jawaban ${label} nomor ${item.no}`"
                  />
                  <span v-if="item.ragu" class="ml-1 font-bold text-amber-700">?</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Stays on screen while a long answer table is scrolled -->
      <div class="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex flex-col gap-2 rounded-b-[20px] border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:-mb-8 md:px-8">
        <div class="min-w-0 text-sm" role="status">
          <p v-for="text in wrongAnswers" :key="text" class="text-red-600">{{ text }}</p>
          <p v-if="errorMessage" class="text-red-600">{{ errorMessage }}</p>
          <p v-if="saveStatus" :class="saveStatus.unsaved ? 'text-amber-700' : 'text-emerald-700'">{{ saveStatus.text }}</p>
          <p v-if="busy" class="text-slate-700">{{ busy }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <button class="btn flex-1 sm:flex-none" :disabled="Boolean(busy) || wrongAnswers.length > 0" @click="saveReview">Simpan</button>
          <button class="btn-ghost flex-1 sm:flex-none" :disabled="Boolean(busy)" @click="nextStudent">Siswa berikutnya →</button>
        </div>
      </div>
    </section>
  </div>
</template>
