<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../lib/api.js'

const stats = ref({ classes: 0, students: 0, exams: 0 })
const recentExams = ref([])
const loaded = ref(false)

// The way through the app for a teacher who has not set everything up yet
const steps = computed(() => [
  { to: '/classes', title: 'Buat kelas', hint: 'Nama kelas, tahun ajaran, semester.', done: stats.value.classes > 0 },
  { to: '/students', title: 'Tambah siswa', hint: 'Satu per satu atau impor CSV.', done: stats.value.students > 0 },
  { to: '/exams', title: 'Buat ujian', hint: 'Kunci jawaban dan cara menghitung nilai.', done: stats.value.exams > 0 },
  { to: '/grade', title: 'Cetak dan koreksi', hint: 'Cetak lembar, lalu foto atau isi manual.', done: false }
])
const showSteps = computed(() => loaded.value && !(stats.value.classes && stats.value.students && stats.value.exams))

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
  loaded.value = true
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
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

    <section v-if="showSteps" class="card p-4 md:p-8">
      <h2 class="text-xl font-semibold">Mulai dari sini</h2>
      <ol class="mt-4 grid gap-3 md:grid-cols-4">
        <li v-for="(step, i) in steps" :key="step.to">
          <RouterLink :to="step.to" class="block h-full rounded-2xl border border-slate-100 bg-white p-4 hover:border-amber-200">
            <p class="font-semibold text-slate-900">{{ i + 1 }}. {{ step.title }}</p>
            <p class="text-sm text-slate-600">{{ step.hint }}</p>
            <p v-if="step.done" class="mt-1 text-sm font-medium text-emerald-700">Sudah ada</p>
          </RouterLink>
        </li>
      </ol>
    </section>

    <section class="card p-4 md:p-8">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">Ujian Terbaru</h2>
        <RouterLink to="/exams" class="btn-ghost">Lihat semua</RouterLink>
      </div>
      <div class="mt-4 space-y-3">
        <RouterLink v-for="exam in recentExams" :key="exam.id" :to="`/exams/${exam.id}`" class="block rounded-2xl border border-slate-100 bg-white p-4">
          <p class="font-semibold text-slate-900">{{ exam.title }}</p>
          <p class="text-sm text-slate-600">{{ exam.class_name }} · {{ exam.subject }} · {{ exam.exam_date }}</p>
        </RouterLink>
        <p v-if="!recentExams.length" class="text-sm text-slate-500">Belum ada ujian.</p>
      </div>
    </section>
  </div>
</template>
