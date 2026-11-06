<script setup>
import { computed } from 'vue'
import { parseAnswers } from '../lib/answerKey.js'
// Same rules as the server, so a letter marked here is the letter the server refuses
import { rules } from '../../../lib/validate.js'

// form: { pg, bs, mj }, the text of each section
const props = defineProps({ form: { type: Object, required: true } })

const SECTIONS = [
  { key: 'pg', name: 'Pilihan Ganda', hint: 'Huruf A–E', fix: 'Pakai huruf A–E.', placeholder: 'Contoh: ABCDE' },
  { key: 'bs', name: 'Benar/Salah', hint: 'B = Benar, S = Salah', fix: 'Pakai huruf B atau S.', placeholder: 'Contoh: BSBS' },
  { key: 'mj', name: 'Menjodohkan', hint: 'Huruf A–K', fix: 'Pakai huruf A–K.', placeholder: 'Contoh: ABCK' }
]

// How each section is read, so a teacher sees the question numbers and wrong letters before saving
const sections = computed(() =>
  SECTIONS.map((section) => {
    const items = parseAnswers(props.form[section.key]).map((answer, i) => ({ no: i + 1, answer, valid: rules[section.key].test(answer) }))
    return { ...section, items, wrong: items.filter((item) => !item.valid).map((item) => item.no) }
  })
)
</script>

<template>
  <div class="mt-4">
    <p class="text-sm font-semibold text-slate-700">Kunci jawaban</p>
    <p class="mt-1 text-xs text-slate-500">Ketik jawaban berurutan mulai nomor 1, tanpa nomor dan koma. Kosongkan bagian yang tidak dipakai.</p>
    <div class="mt-3 grid gap-4 md:grid-cols-3">
      <div v-for="section in sections" :key="section.key">
        <label class="block text-sm text-slate-600">
          Kunci {{ section.name }}
          <span class="mb-1 block text-xs text-slate-500">{{ section.hint }}</span>
          <textarea v-model="form[section.key]" rows="2" class="input" :placeholder="section.placeholder" :aria-invalid="section.wrong.length > 0"></textarea>
        </label>
        <template v-if="section.items.length">
          <p class="mt-2 text-xs font-medium text-slate-600">{{ section.items.length }} soal</p>
          <ol class="mt-1 flex flex-wrap gap-1" :aria-label="`Hasil bacaan ${section.name}`">
            <li
              v-for="item in section.items"
              :key="item.no"
              class="w-9 rounded-lg border py-0.5 text-center"
              :class="item.valid ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50 text-red-700'"
            >
              <span class="block text-[10px] leading-3">{{ item.no }}</span>
              <b class="block text-sm leading-4">{{ item.answer }}</b>
            </li>
          </ol>
          <p v-if="section.wrong.length" class="mt-1 text-xs text-red-600">Periksa nomor {{ section.wrong.join(', ') }}. {{ section.fix }}</p>
        </template>
      </div>
    </div>
  </div>
</template>
