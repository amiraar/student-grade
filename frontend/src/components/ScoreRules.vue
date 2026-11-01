<script setup>
import { computed, watch } from 'vue'

// form: { weight_pg, weight_bs, weight_mj, table } (table = null or [score for 0 correct, 1 correct, ...])
// total: number of questions in the answer key
const props = defineProps({ form: { type: Object, required: true }, total: { type: Number, required: true } })

const proportional = (n) => Array.from({ length: n + 1 }, (_, k) => (n ? Math.round((k / n) * 10000) / 100 : 0))

const useTable = computed({
  get: () => Array.isArray(props.form.table),
  set: (on) => {
    props.form.table = on ? proportional(props.total) : null
  }
})

// Keep one row per possible number of correct answers when the key changes
watch(
  () => props.total,
  (n) => {
    const table = props.form.table
    if (Array.isArray(table) && table.length !== n + 1) {
      props.form.table = proportional(n).map((value, k) => (k < table.length && k < n ? table[k] : value))
    }
  }
)
</script>

<template>
  <div class="mt-4 space-y-3">
    <p class="text-sm font-semibold text-slate-700">Cara menghitung nilai</p>
    <div class="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
      <label class="flex items-center gap-2"><input v-model="useTable" type="radio" :value="false" /> Bobot per bagian (%)</label>
      <label class="flex items-center gap-2"><input v-model="useTable" type="radio" :value="true" /> Tabel: jumlah benar → nilai</label>
    </div>

    <div v-if="!useTable">
      <div class="grid gap-3 md:grid-cols-3">
        <label class="block text-sm text-slate-600">
          Bobot PG (%)
          <input v-model.number="form.weight_pg" type="number" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Bobot B/S (%)
          <input v-model.number="form.weight_bs" type="number" class="input" />
        </label>
        <label class="block text-sm text-slate-600">
          Bobot Menjodohkan (%)
          <input v-model.number="form.weight_mj" type="number" class="input" />
        </label>
      </div>
      <p class="mt-2 text-xs text-slate-500">Total bobot harus 100. Bagian tanpa kunci tidak dihitung; bobotnya dibagi ke bagian lain.</p>
    </div>

    <div v-else>
      <p v-if="!total" class="text-sm text-amber-700">Isi kunci jawaban dulu.</p>
      <template v-else>
        <p class="text-xs text-slate-500">
          Tentukan nilai untuk setiap jumlah jawaban benar (dari {{ total }} soal). Contoh: benar 13 → nilai 65.
        </p>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <label v-for="(value, k) in form.table" :key="k" class="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-1 text-sm">
            <span class="w-16 shrink-0 text-slate-500">Benar {{ k }}</span>
            <input v-model.number="form.table[k]" type="number" min="0" max="100" step="any" class="w-full rounded-lg border border-slate-200 px-2 py-1 text-base md:text-sm" :aria-label="`Nilai jika benar ${k}`" />
          </label>
        </div>
        <button type="button" class="btn-ghost mt-2" @click="form.table = proportional(total)">Isi ulang otomatis (benar ÷ soal × 100)</button>
      </template>
    </div>
  </div>
</template>
