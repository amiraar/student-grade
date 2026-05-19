<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api.js'

const stats = ref({ classes: 0, students: 0, exams: 0 })
const recentExams = ref([])

const load = async () => {
  const [classesRes, examsRes, studentsRes] = await Promise.all([
    api.get('/classes?per_page=1'),
    api.get('/exams?per_page=5'),
    api.get('/students?per_page=1')
  ])
  stats.value = {
    classes: classesRes.data.total,
    students: studentsRes.data.total,
    exams: examsRes.data.total
  }
  recentExams.value = examsRes.data.data
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-2">Ringkasan Aktivitas</h1>
      <p class="text-sm text-slate-600">Pantau progres koreksi dan manajemen kelas Anda.</p>
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Kelas</p>
          <p class="text-3xl font-semibold text-slate-900">{{ stats.classes }}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Siswa</p>
          <p class="text-3xl font-semibold text-slate-900">{{ stats.students }}</p>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Ujian</p>
          <p class="text-3xl font-semibold text-slate-900">{{ stats.exams }}</p>
        </div>
      </div>
    </section>

    <section class="card p-6 md:p-8">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">Ujian Terbaru</h2>
        <RouterLink to="/exams" class="btn-ghost">Lihat semua</RouterLink>
      </div>
      <div class="mt-4 space-y-3">
        <div v-for="exam in recentExams" :key="exam.id" class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="font-semibold text-slate-900">{{ exam.title }}</p>
          <p class="text-sm text-slate-600">{{ exam.subject }} · {{ exam.exam_date }}</p>
        </div>
        <p v-if="!recentExams.length" class="text-sm text-slate-500">Belum ada ujian.</p>
      </div>
    </section>
  </div>
</template>
