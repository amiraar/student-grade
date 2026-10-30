<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api, { errorMessage as getError } from '../lib/api.js'

const SECTIONS = { pg: 'Pilihan Ganda', bs: 'Benar/Salah', mj: 'Menjodohkan' }
const QUALITY = { good: 'Baik', low_contrast: 'Kontras rendah', blurry: 'Buram', tilted: 'Miring', manual: 'Input manual' }
const STATUS_CLASS = {
  correct: 'bg-emerald-50 text-emerald-700',
  wrong: 'bg-red-50 text-red-700',
  empty: 'bg-slate-50 text-slate-500',
  double: 'bg-amber-50 text-amber-700'
}

const classes = ref([])
const students = ref([])
const exams = ref([])
const graded = ref({}) // student_id -> score for the selected exam

const classId = ref('')
const examId = ref('')
const studentId = ref('')
const imageFile = ref(null)
const previewUrl = ref('')
const fileInput = ref(null)
const result = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const notice = ref('')

const gradedCount = computed(() => students.value.filter((s) => graded.value[s.id] !== undefined).length)

const load = async () => {
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
}

watch(classId, async () => {
  examId.value = ''
  studentId.value = ''
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
  graded.value = {}
  resetSheet()
  if (!examId.value) return
  const res = await api.get(`/exams/${examId.value}/results`, { params: { per_page: 200 } })
  graded.value = Object.fromEntries(res.data.data.map((r) => [r.student_id, Number(r.score)]))
})

watch(studentId, resetSheet)

function resetSheet() {
  result.value = null
  errorMessage.value = ''
  notice.value = ''
  imageFile.value = null
  previewUrl.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const handleFile = (event) => {
  const file = event.target.files[0]
  if (!file) return
  imageFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

// Phone photos are often > 4 MB, which is over the Vercel request limit.
// Shrink to max 2000 px JPEG before sending.
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

const sendGrade = async (payload) => {
  loading.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const res = await api.post('/grade', { exam_id: examId.value, student_id: studentId.value, ...payload })
    result.value = res.data
    graded.value = { ...graded.value, [studentId.value]: res.data.score }
    return true
  } catch (err) {
    errorMessage.value = getError(err, 'Gagal mengoreksi lembar jawaban.')
    return false
  } finally {
    loading.value = false
  }
}

const gradeWithAi = async () => {
  try {
    const image = await compressImage(imageFile.value)
    if (await sendGrade({ image })) notice.value = 'Nilai tersimpan. Periksa tabel di bawah; ubah jawaban yang salah dibaca lalu klik Simpan Perubahan.'
  } catch (err) {
    errorMessage.value = err.message
  }
}

// Empty answer table from the exam key, for grading without a photo
const startManual = async () => {
  errorMessage.value = ''
  const res = await api.get(`/exams/${examId.value}`)
  const items = {}
  Object.keys(SECTIONS).forEach((sec) => {
    items[sec] = (res.data.answer_key?.[sec] || [])
      .filter((k) => k.answer)
      .map((k) => ({ no: k.no, key: k.answer, answer: '-', status: 'empty' }))
  })
  result.value = { items, score: null, grade: null, sheet_quality: 'manual' }
  notice.value = 'Isi jawaban siswa di tabel, lalu klik Simpan Perubahan.'
}

const saveEdits = async () => {
  const answers = {}
  Object.keys(SECTIONS).forEach((sec) => {
    answers[sec] = (result.value.items[sec] || []).map((item) => ({
      no: item.no,
      jawaban: String(item.answer || '-').trim().toUpperCase() || '-'
    }))
  })
  if (await sendGrade({ answers })) notice.value = 'Perubahan tersimpan.'
}

const nextStudent = () => {
  const index = students.value.findIndex((s) => s.id === studentId.value)
  const ordered = [...students.value.slice(index + 1), ...students.value.slice(0, index + 1)]
  const next = ordered.find((s) => graded.value[s.id] === undefined)
  if (next) studentId.value = next.id
  else notice.value = 'Semua siswa di kelas ini sudah dinilai.'
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-4">Koreksi Lembar Jawaban</h1>
      <div class="grid gap-3 md:grid-cols-3">
        <select v-model="classId" class="input">
          <option value="">1. Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="examId" class="input" :disabled="!classId">
          <option value="">2. Pilih ujian</option>
          <option v-for="item in exams" :key="item.id" :value="item.id">{{ item.title }} · {{ item.exam_date }}</option>
        </select>
        <select v-model="studentId" class="input" :disabled="!examId">
          <option value="">3. Pilih siswa</option>
          <option v-for="item in students" :key="item.id" :value="item.id">
            {{ item.name }}{{ graded[item.id] !== undefined ? ` — sudah dinilai (${graded[item.id]})` : '' }}
          </option>
        </select>
      </div>
      <p v-if="classId && !exams.length" class="mt-2 text-sm text-amber-700">Kelas ini belum punya ujian. Buat ujian dulu di menu Ujian.</p>
      <p v-if="examId" class="mt-2 text-sm text-slate-600">Sudah dinilai: {{ gradedCount }} dari {{ students.length }} siswa</p>

      <div v-if="studentId" class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <input ref="fileInput" type="file" accept="image/*" capture="environment" @change="handleFile" class="input" />
          <p class="mt-2 text-xs text-slate-500">Foto tegak lurus, cahaya cukup, seluruh lembar terlihat.</p>
          <img v-if="previewUrl" :src="previewUrl" class="mt-4 max-h-96 w-full rounded-2xl border object-contain" alt="Preview" />
        </div>
        <div class="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
          <button class="btn w-full" @click="gradeWithAi" :disabled="!imageFile || loading">
            {{ loading ? 'Memproses...' : 'Koreksi dengan AI' }}
          </button>
          <button class="btn-ghost w-full" @click="startManual" :disabled="loading">Isi jawaban manual (tanpa foto)</button>
          <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
          <p v-if="notice" class="text-sm text-emerald-700">{{ notice }}</p>
          <div v-if="result && result.score !== null" class="text-sm">
            <p class="text-2xl font-semibold">Nilai: {{ result.score }} ({{ result.grade }})</p>
            <p class="text-slate-600">Kualitas foto: {{ QUALITY[result.sheet_quality] || result.sheet_quality || '-' }}</p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="result" class="card p-6 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 class="text-xl font-semibold">Periksa Jawaban</h2>
        <div class="flex gap-2">
          <button class="btn" @click="saveEdits" :disabled="loading">Simpan Perubahan</button>
          <button class="btn-ghost" @click="nextStudent" :disabled="loading">Siswa Berikutnya →</button>
        </div>
      </div>
      <p class="mt-1 text-xs text-slate-500">Isi "-" untuk kosong, "!!" untuk jawaban ganda.</p>
      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <div v-for="(label, sec) in SECTIONS" :key="sec" v-show="result.items[sec]?.length">
          <h3 class="mb-2 font-semibold">
            {{ label }}
            <span v-if="result.detail" class="text-sm font-normal text-slate-500">
              ({{ result.detail[sec].correct }}/{{ result.items[sec].length }} benar)
            </span>
          </h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="py-1">No</th>
                <th>Kunci</th>
                <th>Jawaban</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in result.items[sec]" :key="item.no" :class="STATUS_CLASS[item.status]">
                <td class="px-2 py-1">{{ item.no }}</td>
                <td class="font-semibold">{{ item.key }}</td>
                <td class="py-1">
                  <input v-model="item.answer" maxlength="2" class="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 uppercase" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
