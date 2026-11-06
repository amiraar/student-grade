<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ListPager from '../components/ListPager.vue'
import api, { errorMessage } from '../lib/api.js'

const route = useRoute()
const router = useRouter()
const studentId = route.params.id
const detail = ref(null)
const results = ref([])
const meta = ref({})
const page = ref(1)
const classes = ref([])
const form = ref(null) // set while editing
const error = ref('')

const loadResults = async () => {
  const res = await api.get(`/students/${studentId}/results`, { params: { per_page: 200, page: page.value } })
  results.value = res.data.data
  meta.value = res.data
}

const load = async () => {
  const detailRes = await api.get(`/students/${studentId}`)
  detail.value = detailRes.data
  await loadResults()
}

const goToPage = (value) => {
  page.value = value
  loadResults()
}

const startEdit = async () => {
  error.value = ''
  const res = await api.get('/classes?per_page=200')
  classes.value = res.data.data
  form.value = { name: detail.value.name, nis: detail.value.nis, class_id: detail.value.class_id }
}

const saveEdit = async () => {
  // The server keeps the old value of an empty field, which would look like a saved change
  if (!form.value.name.trim() || !form.value.nis.trim()) {
    error.value = 'Nama dan NIS wajib diisi.'
    return
  }
  try {
    await api.put(`/students/${studentId}`, form.value)
    form.value = null
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Gagal menyimpan siswa.')
  }
}

const remove = async () => {
  if (!window.confirm(`Hapus siswa "${detail.value.name}"? Semua nilai siswa ini ikut terhapus dan tidak bisa dikembalikan.`)) return
  error.value = ''
  try {
    await api.delete(`/students/${studentId}`)
    router.push('/students')
  } catch (err) {
    error.value = errorMessage(err, 'Gagal menghapus siswa.')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in" v-if="detail">
    <section class="card p-4 md:p-8">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="section-title mb-2">{{ detail.name }}</h1>
          <p class="text-sm text-slate-600">NIS: {{ detail.nis }} · {{ detail.class_name }}</p>
        </div>
        <div v-if="!form" class="flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" @click="startEdit">Edit Siswa</button>
          <button type="button" class="btn-danger" @click="remove">Hapus Siswa</button>
        </div>
      </div>
      <p v-if="error && !form" class="mt-2 text-sm text-red-600">{{ error }}</p>

      <div v-if="form" class="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="block text-sm text-slate-600">
            Nama
            <input v-model="form.name" placeholder="Nama siswa" class="input" />
          </label>
          <label class="block text-sm text-slate-600">
            Nomor induk
            <input v-model="form.nis" placeholder="NIS" class="input" />
          </label>
          <label class="block text-sm text-slate-600">
            Kelas
            <select v-model="form.class_id" class="input">
              <option v-for="item in classes" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </label>
        </div>
        <p v-if="form.class_id !== detail.class_id" class="mt-2 text-sm text-amber-700">
          Nilai lama tetap ada di riwayat siswa, tetapi tidak muncul lagi di laporan kelas lama.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn" @click="saveEdit">Simpan</button>
          <button type="button" class="btn-ghost" @click="form = null">Batal</button>
        </div>
        <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
      </div>

      <div class="mt-6">
        <h2 class="text-lg font-semibold mb-3">Riwayat Nilai</h2>
        <div class="space-y-3">
          <div v-for="result in results" :key="result.id" class="rounded-2xl border border-slate-100 bg-white p-4">
            <p class="font-semibold text-slate-900">{{ result.exam_title }}</p>
            <p class="text-sm text-slate-600">{{ result.subject }} · {{ result.exam_date }} · Nilai {{ result.score }}</p>
          </div>
          <p v-if="!results.length" class="text-sm text-slate-500">Belum ada nilai.</p>
        </div>
        <ListPager :meta="meta" @go="goToPage" />
      </div>
    </section>
  </div>
</template>
