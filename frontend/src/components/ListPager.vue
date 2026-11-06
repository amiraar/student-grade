<script setup>
// meta: the list response of the API ({ page, total, total_pages })
defineProps({ meta: { type: Object, required: true } })
defineEmits(['go'])
</script>

<template>
  <nav v-if="meta.total_pages > 1" class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600" aria-label="Halaman daftar">
    <span class="order-first w-full text-center sm:order-none sm:w-auto">Halaman {{ meta.page }} dari {{ meta.total_pages }} · {{ meta.total }} data</span>
    <button type="button" class="btn-ghost sm:order-first" :disabled="meta.page <= 1" @click="$emit('go', meta.page - 1)">← Sebelumnya</button>
    <button type="button" class="btn-ghost" :disabled="meta.page >= meta.total_pages" @click="$emit('go', meta.page + 1)">Berikutnya →</button>
  </nav>
</template>
