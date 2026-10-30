<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import api, { errorMessage as getError } from '../lib/api.js'
import { countsFromKey } from '../lib/sheet.js'
import { fileToGray, readSheet } from '../lib/omr.js'

const SECTIONS = { pg: 'Pilihan Ganda', bs: 'Benar/Salah', mj: 'Menjodohkan' }
const SOURCE = { template: 'Lembar template (tanpa AI)', manual: 'Input manual', good: 'AI · foto baik', low_contrast: 'AI · kontras rendah', blurry: 'AI · buram', tilted: 'AI · miring' }
const STATUS_CLASS = {
  correct: 'bg-emerald-50 text-emerald-800',
  wrong: 'bg-red-50 text-red-800',
  empty: 'bg-slate-50 text-slate-500',
  double: 'bg-amber-50 text-amber-800'
}

const classes = ref([])
const students = ref([])
const exams = ref([])
const exam = ref(null) // selected exam with answer key
const results = ref({}) // student_id -> saved result
const classId = ref('')
const examId = ref('')
const studentId = ref('')
const fileInput = ref(null)
const busy = ref('')
const errorMessage = ref('')
const batch = ref([]) // one row per uploaded photo
const review = ref(null) // { studentId, items, score, grade, source }

const studentName = (id) => students.value.find((s) => s.id === id)?.name || `Siswa #${id}`
const gradedCount = computed(() => students.value.filter((s) => results.value[s.id]).length)
const flaggedCount = computed(() => (review.value ? Object.values(review.value.items).flat().filter((i) => i.ragu).length : 0))

onMounted(async () => {
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
})

watch(classId, async () => {
  examId.value = ''
  students.value = []
  exams.value = []
  if (!classId.value) return
  const [studentsRes, examsRes] = await Promise.all([
    api.get('/students', { params: { class_id: classId.value, per_page: 200, sort: 'name', order: 'asc' } }),
    api.get('/exams', { params: { class_id: classId.value, per_page: 200 } })
  ])
  students.value = studentsRes.data.data
  exams.value = examsRes.data.data
})

watch(examId, async () => {
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
  exam.value = examRes.data
  results.value = Object.fromEntries(resultsRes.data.data.map((r) => [r.student_id, r]))
})

// Selecting a student opens their saved answers (or an empty table) for checking / manual input
watch(studentId, (id) => {
  errorMessage.value = ''
  if (!id) return (review.value = null)
  const saved = results.value[id]
  openReview(id, saved?.answers || {}, saved ? { score: Number(saved.score), grade: saved.grade, source: saved.sheet_quality } : {})
})

// Same comparison as the server (lib/scoring.js); only for showing colours
function openReview(id, answers, extra) {
  const items = {}
  for (const sec of Object.keys(SECTIONS)) {
    items[sec] = (exam.value.answer_key?.[sec] || [])
      .filter((k) => k.answer)
      .map((k) => {
        const a = (answers[sec] || []).find((x) => Number(x.no) === Number(k.no))
        const answer = String(a?.jawaban ?? '-').trim().toUpperCase() || '-'
        const status = answer === '-' ? 'empty' : answer === '!!' ? 'double' : answer === k.answer ? 'correct' : 'wrong'
        return { no: Number(k.no), key: k.answer, answer, status, ragu: Boolean(a?.ragu) }
      })
  }
  review.value = { studentId: id, items, score: null, grade: null, source: null, ...extra }
}

async function save(id, answers, payload = {}) {
  const res = await api.post('/grade', { exam_id: examId.value, student_id: id, answers, ...payload })
  results.value = { ...results.value, [id]: { student_id: id, score: res.data.score, grade: res.data.grade, answers: res.data.answers, sheet_quality: res.data.sheet_quality } }
  return res.data
}

// Photos of the printed template: read in the browser, student found from the printed ID
async function handleFiles(event) {
  const files = [...event.target.files]
  errorMessage.value = ''
  batch.value = files.map((file) => ({ name: file.name, status: 'menunggu' }))
  const counts = countsFromKey(exam.value.answer_key)
  for (const [i, file] of files.entries()) {
    const row = batch.value[i]
    busy.value = `Membaca foto ${i + 1} dari ${files.length}...`
    try {
      const { gray, w, h } = await fileToGray(file)
      const sheet = readSheet(gray, w, h, counts)
      if (!sheet) {
        if (files.length === 1 && studentId.value) {
          row.status = 'bukan lembar template, dibaca AI...'
          const data = await gradeWithAi(file)
          Object.assign(row, { status: 'ok', studentId: studentId.value, score: data.score, flagged: 0, source: 'AI' })
        } else {
          row.status = 'gagal: lembar template tidak terbaca. Foto ulang: seluruh lembar & 4 kotak hitam terlihat. Jika jumlah soal diubah setelah dicetak, cetak ulang lembarnya.'
        }
        continue
      }
      if (sheet.id.examId !== Number(examId.value)) {
        row.status = 'gagal: lembar ini untuk ujian lain'
        continue
      }
      const id = sheet.id.studentId || Number(studentId.value)
      if (!id) {
        row.status = 'gagal: lembar kosong tanpa nama. Pilih siswa dulu, lalu unggah satu foto.'
        continue
      }
      if (!students.value.some((s) => s.id === id)) {
        row.status = 'gagal: siswa di lembar ini tidak ada di kelas'
        continue
      }
      const data = await save(id, sheet.answers, { source: 'template' })
      const flagged = Object.values(sheet.answers).flat().filter((a) => a.ragu).length
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

async function gradeWithAi(file) {
  const image = await compressImage(file)
  const res = await api.post('/grade', { exam_id: examId.value, student_id: studentId.value, image })
  results.value = { ...results.value, [studentId.value]: { student_id: studentId.value, score: res.data.score, grade: res.data.grade, answers: res.data.answers, sheet_quality: res.data.sheet_quality } }
  return res.data
}

function showStudent(id) {
  if (studentId.value === id) openReview(id, results.value[id].answers, { score: Number(results.value[id].score), grade: results.value[id].grade, source: results.value[id].sheet_quality })
  else studentId.value = id
}

async function saveReview() {
  const r = review.value
  const answers = {}
  for (const sec of Object.keys(SECTIONS)) {
    // A teacher-checked answer is no longer "ragu"
    answers[sec] = r.items[sec].map((item) => ({ no: item.no, jawaban: String(item.answer || '-').trim().toUpperCase() || '-' }))
  }
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
      <p v-if="classId && !exams.length" class="mt-2 text-sm text-amber-700">Kelas ini belum punya ujian. Buat ujian dulu di menu Ujian.</p>

      <div v-if="exam" class="mt-4 space-y-3">
        <div class="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Sudah dinilai: <b>{{ gradedCount }}</b> dari {{ students.length }} siswa</p>
          <RouterLink :to="`/exams/${exam.id}/sheet?student=all`" class="btn-ghost">Cetak lembar jawaban</RouterLink>
        </div>

        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="mb-2 font-semibold">3. Foto lembar jawaban</p>
          <input ref="fileInput" type="file" accept="image/*" multiple class="input" :disabled="Boolean(busy)" @change="handleFiles" />
          <p class="mt-2 text-xs text-slate-500">
            Lembar template dari aplikasi: boleh pilih banyak foto sekaligus, siswa dikenali otomatis, dibaca tanpa AI.
            Lembar lain: pilih siswa di bawah dulu, lalu unggah satu foto (dibaca AI).
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
              <span v-else :class="row.status.startsWith('gagal') ? 'text-red-600' : 'text-slate-600'">{{ row.status }}</span>
            </li>
          </ul>
        </div>

        <select v-model="studentId" class="input">
          <option value="">Pilih siswa untuk diperiksa / diisi manual</option>
          <option v-for="item in students" :key="item.id" :value="item.id">
            {{ item.name }}{{ results[item.id] ? ` — ${Number(results[item.id].score)}` : ' — belum dinilai' }}
          </option>
        </select>
        <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
      </div>
    </section>

    <section v-if="review" class="card p-4 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 class="text-xl font-semibold">{{ studentName(review.studentId) }}</h2>
          <p v-if="review.score !== null" class="text-2xl font-semibold">Nilai: {{ review.score }} ({{ review.grade }})</p>
          <p v-else class="text-sm text-slate-600">Belum dinilai. Isi jawaban siswa lalu simpan.</p>
          <p v-if="review.source" class="text-xs text-slate-500">Sumber: {{ SOURCE[review.source] || review.source }}</p>
          <p v-if="review.saved" class="text-sm text-emerald-700">Tersimpan.</p>
          <p v-if="flaggedCount" class="mt-1 text-sm text-amber-800">
            {{ flaggedCount }} jawaban ditandai <b>?</b> (tanda tipis / terhapus / ganda). Cocokkan dengan kertasnya.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn" :disabled="Boolean(busy)" @click="saveReview">Simpan</button>
          <button class="btn-ghost" :disabled="Boolean(busy)" @click="nextStudent">Siswa berikutnya →</button>
        </div>
      </div>
      <p class="mt-2 text-xs text-slate-500">Isi "-" untuk kosong, "!!" untuk jawaban ganda.</p>
      <div class="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="(label, sec) in SECTIONS" :key="sec" v-show="review.items[sec]?.length">
          <h3 class="mb-2 font-semibold">
            {{ label }}
            <span class="text-sm font-normal text-slate-500">({{ review.items[sec].filter((i) => i.status === 'correct').length }}/{{ review.items[sec].length }} benar)</span>
          </h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="px-2 py-1">No</th>
                <th>Kunci</th>
                <th>Jawaban</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in review.items[sec]" :key="item.no" :class="[STATUS_CLASS[item.status], item.ragu ? 'outline outline-2 -outline-offset-2 outline-amber-400' : '']">
                <td class="px-2 py-1">{{ item.no }}</td>
                <td class="font-semibold">{{ item.key }}</td>
                <td class="py-1">
                  <input v-model="item.answer" maxlength="2" class="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-base uppercase md:text-sm" :aria-label="`Jawaban ${label} nomor ${item.no}`" />
                  <span v-if="item.ragu" class="ml-1 font-bold text-amber-700">?</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
