<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')

const submit = async () => {
  error.value = ''
  try {
    await auth.login({ email: email.value, password: password.value })
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal masuk. Periksa email dan kata sandi.'
  }
}
</script>

<template>
  <div class="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
    <section class="card p-8 fade-in">
      <p class="tag mb-3">Login Guru</p>
      <h1 class="section-title mb-3">Masuk untuk mulai koreksi</h1>
      <p class="text-sm text-slate-600">Gunakan akun guru untuk mengelola kelas, ujian, dan nilai.</p>
      <div class="mt-6 space-y-4">
        <input v-model="email" type="email" placeholder="Email" class="input" />
        <input v-model="password" type="password" placeholder="Kata sandi" class="input" />
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button class="btn w-full" @click="submit" :disabled="auth.loading">Masuk</button>
        <p class="text-sm text-slate-600">
          Belum punya akun?
          <RouterLink to="/register" class="font-semibold text-amber-700">Daftar di sini</RouterLink>
        </p>
      </div>
    </section>
    <section class="card p-8 fade-in">
      <h2 class="text-xl font-semibold mb-4">Apa yang bisa dilakukan?</h2>
      <ul class="space-y-3 text-sm text-slate-600">
        <li>Kelola kelas, siswa, dan ujian dari satu dashboard.</li>
        <li>Koreksi lembar jawaban otomatis via Gemini Vision.</li>
        <li>Unduh laporan CSV untuk kebutuhan administrasi.</li>
      </ul>
    </section>
  </div>
</template>
