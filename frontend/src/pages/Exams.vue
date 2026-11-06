<script setup>
import { computed, onMounted, ref } from 'vue'
import AnswerKeyFields from '../components/AnswerKeyFields.vue'
import ListPager from '../components/ListPager.vue'
import ScoreRules from '../components/ScoreRules.vue'
import { buildAnswerKey } from '../lib/answerKey.js'
import api, { errorMessage } from '../lib/api.js'
import { latestRequest } from '../lib/latest.js'

const trackLoad = latestRequest()
const exams = ref([])
const classes = ref([])
const loaded = ref(false)
const meta = ref({})
const page = ref(1)
const search = ref('')
const subject = ref('')
const classId = ref('')
const message = ref({ type: '', text: '' })
const savedExamId = ref(null) // the exam just created, for the next-step links
const firstField = ref(null)

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
  weight_mj: 10,
  table: null
})

const load = async () => {
  const isNewest = trackLoad()
  const [examsRes, classesRes] = await Promise.all([
    api.get('/exams', {
      params: {
        search: search.value,
        subject: subject.value || undefined,
        class_id: classId.value || undefined,
        page: page.value
      }
    }),
    api.get('/classes?per_page=200')
  ])
  if (!isNewest()) return
  exams.value = examsRes.data.data
  meta.value = examsRes.data
  classes.value = classesRes.data.data
  loaded.value = true
}

// A changed filter or a new exam starts again from the first page
const reload = () => {
  page.value = 1
  return load()
}

const goToPage = (value) => {
  page.value = value
  load()
}

const showForm = () => {
  firstField.value.scrollIntoView({ block: 'center' })
  firstField.value.focus({ preventScroll: true })
}

const totalQuestions = computed(() => {
  if (!form.value) return 0
  const key = buildAnswerKey(form.value)
  return key.pg.length + key.bs.length + key.mj.length
})

const submit = async () => {
  const payload = {
    class_id: form.value.class_id,
    title: form.value.title,
    subject: form.value.subject,
    exam_date: form.value.exam_date,
    answer_key: buildAnswerKey(form.value),
    weights: {
      pg: Number(form.value.weight_pg),
      bs: Number(form.value.weight_bs),
      mj: Number(form.value.weight_mj),
      ...(form.value.table ? { table: form.value.table.map(Number) } : {})
    }
  }
  savedExamId.value = null
  let created
  try {
    created = await api.post('/exams', payload)
  } catch (err) {
    message.value = { type: 'error', text: errorMessage(err, 'Gagal menyimpan ujian.') }
    return
  }
  const counts = `PG ${payload.answer_key.pg.length}, B/S ${payload.answer_key.bs.length}, MJ ${payload.answer_key.mj.length} soal`
  message.value = { type: 'success', text: `Ujian tersimpan (${counts}).` }
  savedExamId.value = created.data.id
  form.value = { class_id: '', title: '', subject: '', exam_date: '', pg: '', bs: '', mj: '', weight_pg: 70, weight_bs: 20, weight_mj: 10, table: null }
  await reload()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-4 md:p-8">
      <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="section-title">Ujian</h1>
        <button type="button" class="btn" @click="showForm">Buat Ujian</button>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <input v-model="search" @input="reload" placeholder="Cari judul" class="input" />
        <input v-model="subject" @input="reload" placeholder="Mata pelajaran" class="input" />
        <select v-model="classId" @change="reload" class="input">
          <option value="">Semua kelas</option>
          <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
      <div class="mt-6 grid gap-3">
        <RouterLink v-for="exam in exams" :key="exam.id" :to="`/exams/${exam.id}`" class="rounded-2xl border border-slate-100 bg-white p-4">
          <p class="font-semibold text-slate-900">{{ exam.title }}</p>
          <p class="text-sm text-slate-600">{{ exam.class_name }} · {{ exam.subject }} · {{ exam.exam_date }}</p>
        </RouterLink>
        <p v-if="!exams.length" class="text-sm text-slate-500">Belum ada ujian.</p>
      </div>
      <ListPager :meta="meta" @go="goToPage" />
    </section>

    <section class="card p-4 md:p-8">
      <h2 class="text-xl font-semibold mb-4">Buat Ujian</h2>
      <p v-if="loaded && !classes.length" class="mb-3 text-sm text-amber-700">
        Belum ada kelas. Buat dulu di menu <RouterLink to="/classes" class="font-semibold underline">Kelas</RouterLink>.
      </p>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="block text-sm text-slate-600">
          Kelas
          <select ref="firstField" v-model="form.class_id" class="input">
            <option value="">Pilih kelas</option>
            <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="block text-sm text-slate-600">
          Judul
          <input v-model="form.title" placeholder="Judul ujian" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Pelajaran
          <input v-model="form.subject" placeholder="Mata pelajaran" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Tanggal ujian
          <input v-model="form.exam_date" type="date" class="input" />
        </label>
      </div>

      <AnswerKeyFields :form="form" />
      <ScoreRules :form="form" :total="totalQuestions" />
      <button class="btn mt-4" @click="submit">Simpan Ujian</button>
      <p v-if="message.text" class="mt-2 text-sm" :class="message.type === 'error' ? 'text-red-600' : 'text-emerald-700'">{{ message.text }}</p>
      <div v-if="savedExamId" class="mt-2 flex flex-wrap gap-2">
        <RouterLink :to="`/exams/${savedExamId}/sheet?student=all`" class="btn-ghost">Cetak lembar jawaban</RouterLink>
        <RouterLink :to="`/grade?exam=${savedExamId}`" class="btn-ghost">Mulai koreksi</RouterLink>
      </div>
    </section>
  </div>
</template>
