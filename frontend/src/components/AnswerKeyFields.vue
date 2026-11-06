<script setup>
import { parseAnswers } from '../lib/answerKey.js'

// form: { pg, bs, mj }, the text of each section
defineProps({ form: { type: Object, required: true } })

const SECTIONS = [
  { key: 'pg', label: 'Kunci Pilihan Ganda (A–E)', placeholder: 'Contoh: A,B,C,D,E atau ABCDE' },
  { key: 'bs', label: 'Kunci Benar/Salah (B/S)', placeholder: 'Contoh: B,S,B atau BSB' },
  { key: 'mj', label: 'Kunci Menjodohkan (A–K)', placeholder: 'Contoh: A,B,C atau ABC' }
]

// Shows how the text is read, so a teacher sees the question numbers before saving
const reading = (text) => {
  const answers = parseAnswers(text)
  return answers.length ? `${answers.length} soal: ${answers.map((answer, i) => `${i + 1}.${answer}`).join(' ')}` : ''
}
</script>

<template>
  <div class="mt-4">
    <div class="grid gap-3 md:grid-cols-3">
      <div v-for="section in SECTIONS" :key="section.key">
        <label class="block text-sm text-slate-600">
          {{ section.label }}
          <textarea v-model="form[section.key]" rows="4" class="input" :placeholder="section.placeholder"></textarea>
        </label>
        <p v-if="reading(form[section.key])" class="mt-1 break-words text-xs text-slate-500">{{ reading(form[section.key]) }}</p>
      </div>
    </div>
    <p class="mt-2 text-xs text-slate-500">Setiap huruf dihitung satu soal. Boleh dipisah koma, spasi, atau baris baru, boleh juga ditulis berurutan.</p>
  </div>
</template>
