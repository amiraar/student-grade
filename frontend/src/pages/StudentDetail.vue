<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/api.js'

const route = useRoute()
const studentId = route.params.id
const detail = ref(null)
const results = ref([])

const load = async () => {
  const [detailRes, resultsRes] = await Promise.all([
    api.get(`/students/${studentId}`),
    api.get(`/students/${studentId}/results`)
  ])
  detail.value = detailRes.data
  results.value = resultsRes.data.data
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="detail">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-2">{{ detail.name }}</h1>
      <p class="text-sm text-slate-600">NIS: {{ detail.nis }} · {{ detail.class_name }}</p>
      <div class="mt-6">
        <h2 class="text-lg font-semibold mb-3">Riwayat Nilai</h2>
        <div class="space-y-3">
          <div v-for="result in results" :key="result.id" class="rounded-2xl border border-slate-100 bg-white p-4">
            <p class="font-semibold text-slate-900">{{ result.exam_title }}</p>
            <p class="text-sm text-slate-600">{{ result.subject }} · {{ result.exam_date }} · Nilai {{ result.score }}</p>
          </div>
          <p v-if="!results.length" class="text-sm text-slate-500">Belum ada nilai.</p>
        </div>
      </div>
    </section>
  </div>
</template>
