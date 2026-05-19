<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api.js'

const classes = ref([])
const classId = ref('')
const academicYear = ref('')
const semester = ref('')

const load = async () => {
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
}

const exportCsv = () => {
  const params = new URLSearchParams()
  if (classId.value) params.set('class_id', classId.value)
  if (academicYear.value) params.set('academic_year', academicYear.value)
  if (semester.value) params.set('semester', semester.value)
  window.location.href = `/api/reports/export?${params.toString()}`
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
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
    </section>
  </div>
</template>
