<script setup>
import { computed, onMounted, ref } from 'vue'
import AnswerKeyFields from '../components/AnswerKeyFields.vue'
import ScoreRules from '../components/ScoreRules.vue'
import { useRoute, useRouter } from 'vue-router'
import { buildAnswerKey } from '../lib/answerKey.js'
import api, { errorMessage } from '../lib/api.js'

const route = useRoute()
const router = useRouter()
const examId = route.params.id
const exam = ref(null)
const form = ref(null)
const message = ref({ type: '', text: '' })
const savedResults = ref(0) // scores that a changed key or rule would recalculate
const savedScoring = ref('') // the key and rules as last loaded or saved, to notice a change

const flattenAnswers = (section) => (section || []).map((item) => item.answer).join('')

const weightsFrom = (values) => ({
  pg: Number(values.weight_pg),
  bs: Number(values.weight_bs),
  mj: Number(values.weight_mj),
  ...(values.table ? { table: values.table.map(Number) } : {})
})
const scoringOf = (values) => JSON.stringify({ key: buildAnswerKey(values), weights: weightsFrom(values) })
const sectionCounts = (values) => {
  const key = buildAnswerKey(values)
  return [key.pg.length, key.bs.length, key.mj.length].join()
}
const savedCounts = ref('')

const load = async () => {
  const [examRes, resultsRes] = await Promise.all([api.get(`/exams/${examId}`), api.get(`/exams/${examId}/results`, { params: { per_page: 1 } })])
  exam.value = examRes.data
  savedResults.value = resultsRes.data.total
  form.value = {
    class_id: exam.value.class_id,
    title: exam.value.title,
    subject: exam.value.subject,
    exam_date: exam.value.exam_date,
    pg: flattenAnswers(exam.value.answer_key?.pg),
    bs: flattenAnswers(exam.value.answer_key?.bs),
    mj: flattenAnswers(exam.value.answer_key?.mj),
    weight_pg: exam.value.weights?.pg ?? 0,
    weight_bs: exam.value.weights?.bs ?? 0,
    weight_mj: exam.value.weights?.mj ?? 0,
    table: Array.isArray(exam.value.weights?.table) ? [...exam.value.weights.table] : null
  }
  savedScoring.value = scoringOf(form.value)
  savedCounts.value = sectionCounts(form.value)
}

const totalQuestions = computed(() => {
  if (!form.value) return 0
  const key = buildAnswerKey(form.value)
  return key.pg.length + key.bs.length + key.mj.length
})

// The printed sheet is laid out from these counts, so an old print can no longer be read
const countsChanged = computed(() => Boolean(form.value) && sectionCounts(form.value) !== savedCounts.value)

const update = async () => {
  const scoring = scoringOf(form.value)
  if (savedResults.value > 0 && scoring !== savedScoring.value && !window.confirm(`${savedResults.value} nilai siswa akan dihitung ulang. Lanjutkan?`)) return
  const payload = {
    title: form.value.title,
    subject: form.value.subject,
    exam_date: form.value.exam_date,
    answer_key: buildAnswerKey(form.value),
    weights: weightsFrom(form.value)
  }
  try {
    const res = await api.put(`/exams/${examId}`, payload)
    exam.value = res.data
    savedScoring.value = scoring
    savedCounts.value = sectionCounts(form.value)
    message.value = { type: 'success', text: `Perubahan tersimpan. ${res.data.regraded} nilai siswa dihitung ulang.` }
  } catch (err) {
    message.value = { type: 'error', text: errorMessage(err, 'Gagal menyimpan perubahan.') }
  }
}

const remove = async () => {
  if (!window.confirm(`Hapus ujian "${exam.value.title}"? Semua nilai ujian ini ikut terhapus dan tidak bisa dikembalikan.`)) return
  try {
    await api.delete(`/exams/${examId}`)
    router.push('/exams')
  } catch (err) {
    message.value = { type: 'error', text: errorMessage(err, 'Gagal menghapus ujian.') }
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="exam && form">
    <section class="card p-4 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="tag">Detail Ujian</p>
          <h1 class="section-title mt-2">{{ exam.title }}</h1>
          <p class="text-sm text-slate-600">{{ exam.class_name }} · {{ exam.subject }} · {{ exam.exam_date }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="`/exams/${exam.id}/sheet?student=all`" class="btn-ghost">Cetak Lembar Jawaban</RouterLink>
          <RouterLink :to="`/grade?exam=${exam.id}`" class="btn-ghost">Koreksi</RouterLink>
          <RouterLink :to="`/exams/${exam.id}/results`" class="btn-ghost">Lihat Hasil</RouterLink>
        </div>
      </div>
      <div class="mt-6 grid gap-3 md:grid-cols-2">
        <label class="block text-sm text-slate-600">
          Judul
          <input v-model="form.title" class="input" placeholder="Judul" />
        </label>
        <label class="block text-sm text-slate-600">
          Pelajaran
          <input v-model="form.subject" class="input" placeholder="Mata pelajaran" />
        </label>
        <label class="block text-sm text-slate-600">
          Tanggal ujian
          <input v-model="form.exam_date" type="date" class="input" />
        </label>
      </div>
      <AnswerKeyFields :form="form" />
      <ScoreRules :form="form" :total="totalQuestions" />
      <p v-if="countsChanged" class="mt-4 text-sm text-amber-700">Jumlah soal berubah. Lembar yang sudah dicetak tidak bisa dibaca lagi, jadi cetak ulang setelah menyimpan.</p>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button class="btn" @click="update">Simpan Perubahan</button>
        <button type="button" class="btn-danger" @click="remove">Hapus Ujian</button>
      </div>
      <p v-if="message.text" class="mt-2 text-sm" :class="message.type === 'error' ? 'text-red-600' : 'text-emerald-700'">{{ message.text }}</p>
    </section>
  </div>
</template>
