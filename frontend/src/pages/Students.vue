<script setup>
import { onMounted, ref } from 'vue'
import ListPager from '../components/ListPager.vue'
import api, { errorMessage } from '../lib/api.js'
import { latestRequest } from '../lib/latest.js'

const trackLoad = latestRequest()
const students = ref([])
const classes = ref([])
const loaded = ref(false)
const meta = ref({})
const page = ref(1)
const search = ref('')
const classId = ref('')
const academicYear = ref('')
const semester = ref('')
const form = ref({ name: '', nis: '', class_id: '' })
const firstField = ref(null)
const importText = ref('')
const importFile = ref(null)
const importClassId = ref('')
const message = ref({ type: '', text: '' })
const importMessage = ref({ type: '', text: '' })

const load = async () => {
  const isNewest = trackLoad()
  const [studentsRes, classesRes] = await Promise.all([
    api.get('/students', {
      params: {
        search: search.value,
        class_id: classId.value || undefined,
        academic_year: academicYear.value || undefined,
        semester: semester.value || undefined,
        page: page.value
      }
    }),
    api.get('/classes?per_page=200')
  ])
  if (!isNewest()) return
  students.value = studentsRes.data.data
  meta.value = studentsRes.data
  classes.value = classesRes.data.data
  loaded.value = true
}

// A changed filter or a new student starts again from the first page
const reload = () => {
  page.value = 1
  return load()
}

const goToPage = (value) => {
  page.value = value
  load()
}

const showForm = () => {
  firstField.value.scrollIntoView({ block: 'center' })
  firstField.value.focus({ preventScroll: true })
}

const submit = async () => {
  try {
    await api.post('/students', form.value)
  } catch (err) {
    message.value = { type: 'error', text: errorMessage(err, 'Gagal menyimpan siswa.') }
    return
  }
  message.value = { type: 'success', text: 'Siswa tersimpan.' }
  form.value = { name: '', nis: '', class_id: '' }
  await reload()
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
  try {
    const res = await api.post('/students/import', {
      class_id: importClassId.value || null,
      csv: csvPayload
    })
    importMessage.value = { type: 'success', text: res.data.message }
  } catch (err) {
    importMessage.value = { type: 'error', text: errorMessage(err, 'Gagal import CSV.') }
    return
  }
  importText.value = ''
  importFile.value = null
  await reload()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
      <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="section-title">Data Siswa</h1>
        <button type="button" class="btn" @click="showForm">Tambah Siswa</button>
      </div>
      <p v-if="loaded && !classes.length" class="mb-3 text-sm text-amber-700">
        Belum ada kelas. Buat dulu di menu <RouterLink to="/classes" class="font-semibold underline">Kelas</RouterLink>.
      </p>
      <div class="grid gap-4 md:grid-cols-4">
        <input v-model="search" @input="reload" placeholder="Cari nama / NIS" class="input" />
        <select v-model="classId" @change="reload" class="input">
          <option value="">Semua kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="academicYear" @input="reload" placeholder="Tahun ajaran" class="input" />
        <select v-model="semester" @change="reload" class="input">
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
      <ListPager :meta="meta" @go="goToPage" />
    </section>

    <section class="card p-4 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Tambah Siswa</h2>
      <div class="grid gap-3 md:grid-cols-3">
        <label class="block text-sm text-slate-600">
          Nama
          <input ref="firstField" v-model="form.name" placeholder="Nama siswa" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Nomor induk
          <input v-model="form.nis" placeholder="NIS" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Kelas
          <select v-model="form.class_id" class="input">
            <option value="">Pilih kelas</option>
            <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
      </div>
      <button class="btn mt-4" @click="submit">Simpan</button>
      <p v-if="message.text" class="mt-2 text-sm" :class="message.type === 'error' ? 'text-red-600' : 'text-emerald-700'">{{ message.text }}</p>
    </section>

    <section class="card p-4 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Import CSV</h2>
      <p class="text-sm text-slate-600 mb-3">Format per baris: Nama;NIS (header opsional). Siswa dengan NIS yang sudah ada dilewati.</p>
      <div class="grid gap-3">
        <select v-model="importClassId" class="input">
          <option value="">Pilih kelas tujuan</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input type="file" accept=".csv" @change="handleFile" class="input" />
        <textarea v-model="importText" rows="4" placeholder="Tempel CSV di sini" class="input"></textarea>
        <button class="btn" @click="importCsv">Import</button>
        <p v-if="importMessage.text" class="text-sm" :class="importMessage.type === 'error' ? 'text-red-600' : 'text-emerald-700'">{{ importMessage.text }}</p>
      </div>
    </section>
  </div>
</template>
