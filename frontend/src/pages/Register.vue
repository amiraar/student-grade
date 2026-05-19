<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')

const submit = async () => {
  error.value = ''
  try {
    await auth.register({ name: name.value, email: email.value, password: password.value })
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal mendaftar. Periksa data Anda.'
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <section class="card p-8 fade-in">
      <p class="tag mb-3">Registrasi Guru</p>
      <h1 class="section-title mb-3">Buat akun baru</h1>
      <p class="text-sm text-slate-600">Akun guru digunakan untuk mengelola data kelas dan ujian.</p>
      <div class="mt-6 grid gap-4">
        <input v-model="name" type="text" placeholder="Nama lengkap" class="input" />
        <input v-model="email" type="email" placeholder="Email" class="input" />
        <input v-model="password" type="password" placeholder="Kata sandi (min. 6 karakter)" class="input" />
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button class="btn" @click="submit" :disabled="auth.loading">Daftar</button>
        <p class="text-sm text-slate-600">
          Sudah punya akun?
          <RouterLink to="/login" class="font-semibold text-amber-700">Masuk di sini</RouterLink>
        </p>
      </div>
    </section>
  </div>
</template>
