<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { errorMessage } from '../lib/api.js'

const route = useRoute()
const router = useRouter()
const classId = route.params.id
const detail = ref(null)
const students = ref([])
const report = ref([])
const form = ref(null) // set while editing
const error = ref('')

const load = async () => {
  const [detailRes, studentsRes, reportRes] = await Promise.all([
    api.get(`/classes/${classId}`),
    api.get(`/classes/${classId}/students`),
    api.get(`/classes/${classId}/report`)
  ])
  detail.value = detailRes.data
  students.value = studentsRes.data.data
  report.value = reportRes.data.data
}

const startEdit = () => {
  error.value = ''
  form.value = { name: detail.value.name, academic_year: detail.value.academic_year, semester: detail.value.semester }
}

const saveEdit = async () => {
  // The server keeps the old value of an empty field, which would look like a saved change
  if (!form.value.name.trim() || !form.value.academic_year.trim()) {
    error.value = 'Nama kelas dan tahun ajaran wajib diisi.'
    return
  }
  try {
    const res = await api.put(`/classes/${classId}`, form.value)
    detail.value = res.data
    form.value = null
  } catch (err) {
    error.value = errorMessage(err, 'Gagal menyimpan kelas.')
  }
}

const remove = async () => {
  if (!window.confirm(`Hapus kelas "${detail.value.name}"? Semua siswa, ujian, dan nilai di kelas ini ikut terhapus dan tidak bisa dikembalikan.`)) return
  error.value = ''
  try {
    await api.delete(`/classes/${classId}`)
    router.push('/classes')
  } catch (err) {
    error.value = errorMessage(err, 'Gagal menghapus kelas.')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="detail">
    <section class="card p-4 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="section-title mb-2">{{ detail.name }}</h1>
          <p class="text-sm text-slate-600">{{ detail.academic_year }} · Semester {{ detail.semester }}</p>
        </div>
        <div v-if="!form" class="flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" @click="startEdit">Edit Kelas</button>
          <button type="button" class="btn-danger" @click="remove">Hapus Kelas</button>
        </div>
      </div>
      <p v-if="error && !form" class="mt-2 text-sm text-red-600">{{ error }}</p>

      <div v-if="form" class="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="block text-sm text-slate-600">
            Nama
            <input v-model="form.name" placeholder="Nama kelas" class="input" />
          </label>
          <label class="block text-sm text-slate-600">
            Tahun
            <input v-model="form.academic_year" placeholder="Tahun ajaran" class="input" />
          </label>
          <label class="block text-sm text-slate-600">
            Semester
            <select v-model="form.semester" class="input">
              <option :value="1">Semester 1</option>
              <option :value="2">Semester 2</option>
            </select>
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn" @click="saveEdit">Simpan</button>
          <button type="button" class="btn-ghost" @click="form = null">Batal</button>
        </div>
        <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 class="text-lg font-semibold mb-3">Siswa</h2>
          <div class="space-y-2">
            <div v-for="student in students" :key="student.id" class="flex items-center justify-between text-sm">
              <RouterLink :to="`/students/${student.id}`" class="font-medium text-slate-900">{{ student.name }}</RouterLink>
              <span class="text-slate-500">{{ student.latest_score ?? '-' }}</span>
            </div>
          </div>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 class="text-lg font-semibold mb-3">Rata-rata</h2>
          <div class="space-y-2 text-sm">
            <div v-for="item in report" :key="item.student_id" class="flex items-center justify-between">
              <span>{{ item.student_name }}</span>
              <span class="font-semibold">{{ item.average_score ?? '-' }}</span>
            </div>
            <p v-if="!report.length" class="text-slate-500">Belum ada nilai.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
