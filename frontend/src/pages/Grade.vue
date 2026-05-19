<script setup>
import { onMounted, ref, watch } from 'vue'
import api from '../lib/api.js'

const classes = ref([])
const students = ref([])
const exams = ref([])

const classId = ref('')
const examId = ref('')
const studentId = ref('')
const imageFile = ref(null)
const previewUrl = ref('')
const result = ref(null)
const warning = ref('')
const errorMessage = ref('')

const load = async () => {
  const [classesRes, examsRes] = await Promise.all([
    api.get('/classes?per_page=200'),
    api.get('/exams?per_page=200')
  ])
  classes.value = classesRes.data.data
  exams.value = examsRes.data.data
}

const loadStudents = async () => {
  if (!classId.value) {
    students.value = []
    return
  }
  const res = await api.get('/students', { params: { class_id: classId.value, per_page: 200 } })
  students.value = res.data.data
}

const handleFile = (event) => {
  const file = event.target.files[0]
  if (!file) return
  imageFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result || ''
      const base64 = String(result).split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

const submit = async () => {
  warning.value = ''
  result.value = null
  errorMessage.value = ''
  try {
    const examRes = await api.get(`/exams/${examId.value}`)
    const base64 = await toBase64(imageFile.value)
    const res = await api.post('/grade', {
      image: base64,
      exam_id: examId.value,
      student_id: studentId.value,
      answer_key: examRes.data.answer_key,
      weights: examRes.data.weights
    })
    result.value = res.data
    if (res.data.count_mismatch) {
      warning.value = 'Jumlah soal terdeteksi berbeda dengan kunci. Periksa kembali.'
    }
  } catch (err) {
    errorMessage.value = err.response?.data?.message || 'Gagal mengoreksi lembar jawaban.'
  }
}

watch(classId, loadStudents)

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-4">Koreksi Lembar Jawaban</h1>
      <div class="grid gap-3 md:grid-cols-3">
        <select v-model="classId" class="input">
          <option value="">Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="examId" class="input">
          <option value="">Pilih ujian</option>
          <option v-for="item in exams" :key="item.id" :value="item.id">{{ item.title }}</option>
        </select>
        <select v-model="studentId" class="input">
          <option value="">Pilih siswa</option>
          <option v-for="item in students" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <input type="file" accept="image/png,image/jpeg" @change="handleFile" class="input" />
          <p class="mt-2 text-xs text-slate-500">Gunakan foto jelas, rata, dan seluruh lembar terlihat.</p>
          <img v-if="previewUrl" :src="previewUrl" class="mt-4 rounded-2xl border" alt="Preview" />
        </div>
        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <button class="btn w-full" @click="submit" :disabled="!imageFile || !examId || !studentId">Koreksi Sekarang</button>
          <p v-if="errorMessage" class="mt-3 text-sm text-red-600">{{ errorMessage }}</p>
          <p v-if="warning" class="mt-3 text-sm text-amber-700">{{ warning }}</p>
          <div v-if="result" class="mt-4 space-y-2 text-sm">
            <p class="text-lg font-semibold">Nilai: {{ result.score }} ({{ result.grade }})</p>
            <p>Kualitas: {{ result.sheet_quality }}</p>
            <p>PG Benar: {{ result.detail.pg.correct }}</p>
            <p>BS Benar: {{ result.detail.bs.correct }}</p>
            <p>MJ Benar: {{ result.detail.mj.correct }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
