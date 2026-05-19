<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api.js'

const students = ref([])
const classes = ref([])
const search = ref('')
const classId = ref('')
const academicYear = ref('')
const semester = ref('')
const form = ref({ name: '', nis: '', class_id: '' })
const importText = ref('')
const importFile = ref(null)

const load = async () => {
  const [studentsRes, classesRes] = await Promise.all([
    api.get('/students', {
      params: {
        search: search.value,
        class_id: classId.value || undefined,
        academic_year: academicYear.value || undefined,
        semester: semester.value || undefined
      }
    }),
    api.get('/classes?per_page=200')
  ])
  students.value = studentsRes.data.data
  classes.value = classesRes.data.data
}

const submit = async () => {
  await api.post('/students', form.value)
  form.value = { name: '', nis: '', class_id: '' }
  await load()
}

const handleFile = (event) => {
  importFile.value = event.target.files[0]
}

const readFileBase64 = (file) =>
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

const importCsv = async () => {
  let csvPayload = importText.value
  if (importFile.value) {
    csvPayload = await readFileBase64(importFile.value)
  }
  await api.post('/students/import', {
    class_id: classId.value || form.value.class_id || null,
    csv: csvPayload
  })
  importText.value = ''
  importFile.value = null
  await load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-4">Data Siswa</h1>
      <div class="grid gap-4 md:grid-cols-4">
        <input v-model="search" @input="load" placeholder="Cari nama / NIS" class="input" />
        <select v-model="classId" @change="load" class="input">
          <option value="">Semua kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="academicYear" @input="load" placeholder="Tahun ajaran" class="input" />
        <select v-model="semester" @change="load" class="input">
          <option value="">Semua semester</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
      </div>
      <div class="mt-6 grid gap-3">
        <div v-for="student in students" :key="student.id" class="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4">
          <div>
            <RouterLink :to="`/students/${student.id}`" class="font-semibold text-slate-900">{{ student.name }}</RouterLink>
            <p class="text-sm text-slate-600">NIS: {{ student.nis }} · {{ student.class_name }}</p>
          </div>
        </div>
        <p v-if="!students.length" class="text-sm text-slate-500">Belum ada siswa.</p>
      </div>
    </section>

    <section class="card p-6 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Tambah Siswa</h2>
      <div class="grid gap-3 md:grid-cols-3">
        <input v-model="form.name" placeholder="Nama siswa" class="input" />
        <input v-model="form.nis" placeholder="NIS" class="input" />
        <select v-model="form.class_id" class="input">
          <option value="">Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
      <button class="btn mt-4" @click="submit">Simpan</button>
    </section>

    <section class="card p-6 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Import CSV</h2>
      <p class="text-sm text-slate-600 mb-3">Format: Nama;NIS (header opsional). Pilih kelas terlebih dahulu.</p>
      <div class="grid gap-3">
        <input type="file" accept=".csv" @change="handleFile" class="input" />
        <textarea v-model="importText" rows="4" placeholder="Tempel CSV di sini" class="input"></textarea>
        <button class="btn" @click="importCsv">Import</button>
      </div>
    </section>
  </div>
</template>
