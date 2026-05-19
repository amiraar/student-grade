<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/api.js'

const route = useRoute()
const classId = route.params.id
const detail = ref(null)
const students = ref([])
const report = ref([])

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

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="detail">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-2">{{ detail.name }}</h1>
      <p class="text-sm text-slate-600">{{ detail.academic_year }} · Semester {{ detail.semester }}</p>
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
