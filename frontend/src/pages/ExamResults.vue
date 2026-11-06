<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ListPager from '../components/ListPager.vue'
import api, { downloadFile, errorMessage } from '../lib/api.js'
import { latestRequest } from '../lib/latest.js'
import { GRADE_RULES_TEXT } from '../../../lib/scoring.js'

const trackLoad = latestRequest()
const route = useRoute()
const examId = route.params.id
const exam = ref(null)
const results = ref([])
const meta = ref({})
const page = ref(1)
const search = ref('')
const grade = ref('')
const error = ref('')
const ungraded = ref([]) // students of the class without a score for this exam

const load = async () => {
  const isNewest = trackLoad()
  const res = await api.get(`/exams/${examId}/results`, {
    params: {
      search: search.value,
      grade: grade.value || undefined,
      per_page: 200,
      page: page.value
    }
  })
  if (!isNewest()) return
  results.value = res.data.data
  meta.value = res.data
}

// A changed filter starts again from the first page
const reload = () => {
  page.value = 1
  return load()
}

const goToPage = (value) => {
  page.value = value
  load()
}

const loadExam = async () => {
  const examRes = await api.get(`/exams/${examId}`)
  exam.value = examRes.data
  const [studentsRes, allResultsRes] = await Promise.all([
    api.get('/students', { params: { class_id: examRes.data.class_id, per_page: 200, sort: 'name', order: 'asc' } }),
    api.get(`/exams/${examId}/results`, { params: { per_page: 200 } })
  ])
  const graded = new Set(allResultsRes.data.data.map((result) => result.student_id))
  ungraded.value = studentsRes.data.data.filter((student) => !graded.has(student.id))
}

// The list of missing students covers the whole class, so it is left out of a filtered view
const isFiltered = computed(() => Boolean(search.value || grade.value))

const exportCsv = async () => {
  error.value = ''
  try {
    await downloadFile(`/exams/${examId}/results/export`, 'hasil-ujian.csv')
  } catch (err) {
    error.value = errorMessage(err, 'Gagal mengunduh CSV.')
  }
}

const sectionText = (detail) =>
  [['pg', 'PG'], ['bs', 'B/S'], ['mj', 'MJ']]
    .map(([sec, label]) => {
      const d = detail?.[sec]
      const total = d ? d.correct + d.wrong + d.empty + d.double : 0
      return total ? `${label} ${d.correct}/${total}` : null
    })
    .filter(Boolean)
    .join(' · ')

onMounted(() => {
  load()
  loadExam()
})
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="section-title">Hasil Ujian</h1>
          <p v-if="exam" class="mt-1 text-sm text-slate-600">{{ exam.title }} · {{ exam.class_name }} · {{ exam.exam_date }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ GRADE_RULES_TEXT }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="`/grade?exam=${examId}`" class="btn-ghost">Koreksi</RouterLink>
          <button class="btn-ghost" @click="exportCsv">Unduh CSV</button>
        </div>
      </div>
      <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <input v-model="search" @input="reload" placeholder="Cari siswa" class="input" />
        <select v-model="grade" @change="reload" class="input">
          <option value="">Semua grade</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
        </select>
      </div>
      <div class="mt-6 space-y-3">
        <RouterLink
          v-for="result in results"
          :key="result.id"
          :to="`/grade?exam=${examId}&student=${result.student_id}`"
          class="block rounded-2xl border border-slate-100 bg-white p-4 hover:border-amber-200"
        >
          <p class="font-semibold text-slate-900">{{ result.student_name }}</p>
          <p class="text-sm text-slate-600">Nilai {{ Number(result.score) }} · Grade {{ result.grade }} · {{ sectionText(result.detail) }}</p>
        </RouterLink>
        <p v-if="!results.length" class="text-sm text-slate-500">Belum ada hasil.</p>
      </div>
      <ListPager :meta="meta" @go="goToPage" />

      <div v-if="ungraded.length && !isFiltered" class="mt-6">
        <h2 class="text-lg font-semibold mb-3">Belum dinilai ({{ ungraded.length }})</h2>
        <div class="grid gap-2 md:grid-cols-2">
          <RouterLink
            v-for="student in ungraded"
            :key="student.id"
            :to="`/grade?exam=${examId}&student=${student.id}`"
            class="block rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:border-amber-200"
          >
            {{ student.name }}
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
