<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/api.js'

const route = useRoute()
const examId = route.params.id
const results = ref([])
const search = ref('')
const grade = ref('')

const load = async () => {
  const res = await api.get(`/exams/${examId}/results`, {
    params: {
      search: search.value,
      grade: grade.value || undefined
    }
  })
  results.value = res.data.data
}

const exportCsv = () => {
  window.location.href = `/api/exams/${examId}/results/export`
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="section-title">Hasil Ujian</h1>
        <button class="btn-ghost" @click="exportCsv">Unduh CSV</button>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <input v-model="search" @input="load" placeholder="Cari siswa" class="input" />
        <select v-model="grade" @change="load" class="input">
          <option value="">Semua grade</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
        </select>
      </div>
      <div class="mt-6 space-y-3">
        <div v-for="result in results" :key="result.id" class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="font-semibold text-slate-900">{{ result.student_name }}</p>
          <p class="text-sm text-slate-600">Nilai {{ result.score }} · Grade {{ result.grade }}</p>
        </div>
        <p v-if="!results.length" class="text-sm text-slate-500">Belum ada hasil.</p>
      </div>
    </section>
  </div>
</template>
