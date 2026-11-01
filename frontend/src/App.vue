<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const route = useRoute()
const auth = useAuthStore()

const isAuthPage = computed(() => ['/login', '/register'].includes(route.path))
const links = [
  { to: '/', label: 'Ringkasan' },
  { to: '/classes', label: 'Kelas' },
  { to: '/students', label: 'Siswa' },
  { to: '/exams', label: 'Ujian' },
  { to: '/grade', label: 'Koreksi' },
  { to: '/reports', label: 'Laporan' }
]
</script>

<template>
  <!-- Print page: no app chrome -->
  <RouterView v-if="route.meta.bare" />
  <div v-else class="min-h-screen bg-ambient text-slate-900">
    <header class="border-b border-ink/10 bg-white/70 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">SG</div>
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Student Grade</p>
            <p class="hidden font-serif text-lg sm:block">Manajemen Nilai & Koreksi</p>
          </div>
        </div>
        <nav v-if="!isAuthPage" class="hidden items-center gap-1 text-sm font-medium lg:flex">
          <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">{{ link.label }}</RouterLink>
        </nav>
        <div v-if="!isAuthPage" class="flex shrink-0 items-center gap-3">
          <div class="hidden text-right text-xs text-slate-500 md:block">
            <p class="font-medium text-slate-900">{{ auth.user?.name || 'Guru' }}</p>
            <p>{{ auth.user?.email || '-' }}</p>
          </div>
          <button class="btn-ghost" @click="auth.logout">Keluar</button>
        </div>
      </div>
      <!-- Small screens: all menu items visible in a grid -->
      <nav v-if="!isAuthPage" class="grid grid-cols-3 gap-1 px-4 pb-3 text-center text-sm font-medium sm:grid-cols-6 lg:hidden">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">{{ link.label }}</RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <RouterView />
    </main>
  </div>
</template>
