<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/api.js'

const route = useRoute()
const examId = route.params.id
const exam = ref(null)
const form = ref(null)

const flattenAnswers = (section) => (section || []).map((item) => item.answer).join(', ')

const load = async () => {
  const res = await api.get(`/exams/${examId}`)
  exam.value = res.data
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
    weight_mj: exam.value.weights?.mj ?? 0
  }
}

const buildAnswerKey = () => {
  const normalize = (value) =>
    value
      .split(/[\n,;\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)

  const buildSection = (values) => values.map((answer, index) => ({ no: index + 1, answer }))

  return {
    pg: buildSection(normalize(form.value.pg)),
    bs: buildSection(normalize(form.value.bs)),
    mj: buildSection(normalize(form.value.mj))
  }
}

const update = async () => {
  const payload = {
    title: form.value.title,
    subject: form.value.subject,
    exam_date: form.value.exam_date,
    answer_key: buildAnswerKey(),
    weights: {
      pg: Number(form.value.weight_pg),
      bs: Number(form.value.weight_bs),
      mj: Number(form.value.weight_mj)
    }
  }
  const res = await api.put(`/exams/${examId}`, payload)
  exam.value = res.data
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="exam && form">
    <section class="card p-6 md:p-8">
      <div class="flex items-center justify-between">
        <div>
          <p class="tag">Detail Ujian</p>
          <h1 class="section-title mt-2">{{ exam.title }}</h1>
          <p class="text-sm text-slate-600">{{ exam.subject }} · {{ exam.exam_date }}</p>
        </div>
        <RouterLink :to="`/exams/${exam.id}/results`" class="btn-ghost">Lihat Hasil</RouterLink>
      </div>
      <div class="mt-6 grid gap-3 md:grid-cols-2">
        <input v-model="form.title" class="input" placeholder="Judul" />
        <input v-model="form.subject" class="input" placeholder="Mata pelajaran" />
        <input v-model="form.exam_date" type="date" class="input" />
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <textarea v-model="form.pg" rows="4" class="input" placeholder="Kunci PG"></textarea>
        <textarea v-model="form.bs" rows="4" class="input" placeholder="Kunci B/S"></textarea>
        <textarea v-model="form.mj" rows="4" class="input" placeholder="Kunci Menjodohkan"></textarea>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <input v-model="form.weight_pg" type="number" class="input" placeholder="Bobot PG" />
        <input v-model="form.weight_bs" type="number" class="input" placeholder="Bobot B/S" />
        <input v-model="form.weight_mj" type="number" class="input" placeholder="Bobot Menjodohkan" />
      </div>
      <button class="btn mt-4" @click="update">Simpan Perubahan</button>
    </section>
  </div>
</template>
