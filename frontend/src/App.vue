<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const route = useRoute()
const auth = useAuthStore()

const isAuthPage = computed(() => ['/login', '/register'].includes(route.path))
</script>

<template>
  <div class="min-h-screen bg-ambient text-slate-900">
    <header class="border-b border-ink/10 bg-white/70 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-ink text-white grid place-items-center text-lg font-semibold">SG</div>
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-ink/60">Student Grade</p>
            <p class="font-serif text-lg">Manajemen Nilai & Koreksi</p>
          </div>
        </div>
        <nav v-if="!isAuthPage" class="hidden items-center gap-4 text-sm font-medium md:flex">
          <RouterLink to="/" class="nav-link">Ringkasan</RouterLink>
          <RouterLink to="/classes" class="nav-link">Kelas</RouterLink>
          <RouterLink to="/students" class="nav-link">Siswa</RouterLink>
          <RouterLink to="/exams" class="nav-link">Ujian</RouterLink>
          <RouterLink to="/grade" class="nav-link">Koreksi</RouterLink>
          <RouterLink to="/reports" class="nav-link">Laporan</RouterLink>
        </nav>
        <div v-if="!isAuthPage" class="flex items-center gap-3">
          <div class="hidden text-right text-xs text-ink/60 md:block">
            <p class="font-medium text-ink">{{ auth.user?.name || 'Guru' }}</p>
            <p>{{ auth.user?.email || '-' }}</p>
          </div>
          <button class="btn-ghost" @click="auth.logout">Keluar</button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
