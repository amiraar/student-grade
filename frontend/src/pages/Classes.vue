<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api.js'

const classes = ref([])
const meta = ref({ total: 0 })
const search = ref('')
const form = ref({ name: '', academic_year: '', semester: 1 })

const load = async () => {
  const res = await api.get('/classes', { params: { search: search.value } })
  classes.value = res.data.data
  meta.value = res.data
}

const submit = async () => {
  await api.post('/classes', form.value)
  form.value = { name: '', academic_year: '', semester: 1 }
  await load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6 fade-in">
    <section class="card p-6 md:p-8">
      <h1 class="section-title mb-4">Daftar Kelas</h1>
      <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div class="space-y-3">
          <input v-model="search" @input="load" placeholder="Cari kelas" class="input" />
          <div class="grid gap-3">
            <RouterLink v-for="item in classes" :key="item.id" :to="`/classes/${item.id}`" class="rounded-2xl border border-slate-100 bg-white p-4 hover:border-amber-200">
              <p class="font-semibold text-slate-900">{{ item.name }}</p>
              <p class="text-sm text-slate-600">{{ item.academic_year }} · Semester {{ item.semester }}</p>
            </RouterLink>
            <p v-if="!classes.length" class="text-sm text-slate-500">Belum ada kelas.</p>
          </div>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h2 class="text-lg font-semibold mb-3">Tambah Kelas</h2>
          <div class="space-y-3">
            <input v-model="form.name" placeholder="Nama kelas" class="input" />
            <input v-model="form.academic_year" placeholder="Tahun ajaran (contoh: 2025/2026)" class="input" />
            <select v-model="form.semester" class="input">
              <option :value="1">Semester 1</option>
              <option :value="2">Semester 2</option>
            </select>
            <button class="btn w-full" @click="submit">Simpan</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
