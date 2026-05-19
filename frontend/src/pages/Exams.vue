<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api.js'

const exams = ref([])
const classes = ref([])
const search = ref('')
const subject = ref('')
const classId = ref('')

const form = ref({
  class_id: '',
  title: '',
  subject: '',
  exam_date: '',
  pg: '',
  bs: '',
  mj: '',
  weight_pg: 70,
  weight_bs: 20,
  weight_mj: 10
})

const load = async () => {
  const [examsRes, classesRes] = await Promise.all([
    api.get('/exams', {
      params: {
        search: search.value,
        subject: subject.value || undefined,
        class_id: classId.value || undefined
      }
    }),
    api.get('/classes?per_page=200')
  ])
  exams.value = examsRes.data.data
  classes.value = classesRes.data.data
}

const buildAnswerKey = () => {
  const normalize = (value) =>
    value
      .split(/[\n,;\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)

  const buildSection = (values) =>
    values.map((answer, index) => ({ no: index + 1, answer }))

  return {
    pg: buildSection(normalize(form.value.pg)),
    bs: buildSection(normalize(form.value.bs)),
    mj: buildSection(normalize(form.value.mj))
  }
}

const submit = async () => {
  const payload = {
    class_id: form.value.class_id,
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
  await api.post('/exams', payload)
  form.value = { class_id: '', title: '', subject: '', exam_date: '', pg: '', bs: '', mj: '', weight_pg: 70, weight_bs: 20, weight_mj: 10 }
  await load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-4">Ujian</h1>
      <div class="grid gap-4 md:grid-cols-3">
        <input v-model="search" @input="load" placeholder="Cari judul" class="input" />
        <input v-model="subject" @input="load" placeholder="Mata pelajaran" class="input" />
        <select v-model="classId" @change="load" class="input">
          <option value="">Semua kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
      <div class="mt-6 grid gap-3">
        <RouterLink v-for="exam in exams" :key="exam.id" :to="`/exams/${exam.id}`" class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="font-semibold text-slate-900">{{ exam.title }}</p>
          <p class="text-sm text-slate-600">{{ exam.subject }} · {{ exam.exam_date }}</p>
        </RouterLink>
        <p v-if="!exams.length" class="text-sm text-slate-500">Belum ada ujian.</p>
      </div>
    </section>

    <section class="card p-6 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Buat Ujian</h2>
      <div class="grid gap-3 md:grid-cols-2">
        <select v-model="form.class_id" class="input">
          <option value="">Pilih kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="form.title" placeholder="Judul ujian" class="input" />
        <input v-model="form.subject" placeholder="Mata pelajaran" class="input" />
        <input v-model="form.exam_date" type="date" class="input" />
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <textarea v-model="form.pg" rows="4" class="input" placeholder="Kunci PG (contoh: A,B,C,D)"></textarea>
        <textarea v-model="form.bs" rows="4" class="input" placeholder="Kunci B/S (contoh: B,S,B)"></textarea>
        <textarea v-model="form.mj" rows="4" class="input" placeholder="Kunci Menjodohkan (contoh: A,B,C)"></textarea>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <input v-model="form.weight_pg" type="number" class="input" placeholder="Bobot PG" />
        <input v-model="form.weight_bs" type="number" class="input" placeholder="Bobot B/S" />
        <input v-model="form.weight_mj" type="number" class="input" placeholder="Bobot Menjodohkan" />
      </div>
      <button class="btn mt-4" @click="submit">Simpan Ujian</button>
    </section>
  </div>
</template>
