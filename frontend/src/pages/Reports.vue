<script setup>
import { onMounted, ref } from 'vue'
import api, { downloadFile, errorMessage } from '../lib/api.js'

const classes = ref([])
const classId = ref('')
const academicYear = ref('')
const semester = ref('')
const error = ref('')

const load = async () => {
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
}

const exportCsv = async () => {
  error.value = ''
  try {
    await downloadFile('/reports/export', 'laporan-kelas.csv', {
      class_id: classId.value || undefined,
      academic_year: academicYear.value || undefined,
      semester: semester.value || undefined
    })
  } catch (err) {
    error.value = errorMessage(err, 'Gagal mengunduh laporan.')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
      <h1 class="section-title mb-4">Laporan</h1>
      <div class="grid gap-3 md:grid-cols-3">
        <select v-model="classId" class="input">
          <option value="">Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="academicYear" placeholder="Tahun ajaran" class="input" />
        <select v-model="semester" class="input">
          <option value="">Semester</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
      </div>
      <button class="btn mt-4" @click="exportCsv">Unduh Laporan CSV</button>
      <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
    </section>
  </div>
</template>
