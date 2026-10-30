<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '../lib/api.js'
import { BUBBLE_RADIUS, ID_CELL, MARKERS, MARKER_SIZE, ORIENTATION_MARK, buildLayout, countsFromKey, encodeId, idCells } from '../lib/sheet.js'

const route = useRoute()
const exam = ref(null)
const students = ref([])
const perStudent = ref(route.query.student === 'all')

const counts = computed(() => (exam.value ? countsFromKey(exam.value.answer_key) : null))
const layout = computed(() => (counts.value ? buildLayout(counts.value) : null))
// One page per student (name + ID printed), or one blank page to photocopy
const pages = computed(() => (perStudent.value ? students.value : [null]))

const print = () => window.print()
const mm = (v) => `${v}mm`
const box = (x, y, size) => ({ left: mm(x - size / 2), top: mm(y - size / 2), width: mm(size), height: mm(size) })
const square = (x, y, size) => ({ ...box(x, y, size), borderWidth: mm(size / 2) })

const load = async () => {
  const res = await api.get(`/exams/${route.params.id}`)
  exam.value = res.data
  const studentsRes = await api.get('/students', { params: { class_id: res.data.class_id, per_page: 200, sort: 'name', order: 'asc' } })
  students.value = studentsRes.data.data
}

onMounted(load)
</script>

<template>
  <div v-if="exam && layout">
    <div class="no-print mx-auto max-w-3xl space-y-3 p-4">
      <RouterLink :to="`/exams/${exam.id}`" class="btn-ghost">← Kembali</RouterLink>
      <h1 class="section-title">Lembar Jawaban: {{ exam.title }}</h1>
      <p v-if="!layout.fits" class="text-sm text-red-600">Soal terlalu banyak untuk satu halaman. Kurangi jumlah soal per ujian.</p>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="perStudent" type="checkbox" />
        Satu lembar per siswa (nama dicetak, siswa dikenali otomatis saat difoto) — {{ students.length }} siswa
      </label>
      <p class="text-sm text-slate-600">Cetak di kertas A4 dengan skala 100% (Actual size). Jangan dilipat; keempat kotak hitam di pojok harus terlihat saat difoto.</p>
      <button class="btn" :disabled="!layout.fits" @click="print">Cetak</button>
    </div>

    <div v-for="student in pages" :key="student?.id ?? 'blank'" class="sheet">
      <div v-for="(m, i) in MARKERS" :key="`m${i}`" class="ink" :style="square(m.x, m.y, MARKER_SIZE)"></div>
      <div class="ink" :style="square(ORIENTATION_MARK.x, ORIENTATION_MARK.y, ORIENTATION_MARK.size)"></div>

      <div class="text" :style="{ left: mm(32), top: mm(8), fontSize: '13pt', fontWeight: 700 }">LEMBAR JAWABAN</div>
      <div class="text" :style="{ left: mm(32), top: mm(14), fontSize: '9pt' }">{{ exam.title }} · {{ exam.subject }} · {{ exam.exam_date }}</div>
      <div class="text" :style="{ left: mm(120), top: mm(8), fontSize: '9pt' }">Nama: {{ student ? student.name : '________________________' }}</div>
      <div class="text" :style="{ left: mm(120), top: mm(14), fontSize: '9pt' }">NIS: {{ student ? student.nis : '____________' }}</div>
      <div class="text" :style="{ left: mm(16), top: mm(25), fontSize: '7.5pt' }">
        Hitamkan penuh SATU bulatan per soal dengan pensil 2B atau pulpen hitam. Jika salah, hapus bersih.
      </div>

      <template v-for="section in layout.sections" :key="section.key">
        <div class="text" :style="{ left: mm(16), top: mm(section.titleY), fontSize: '9pt', fontWeight: 700 }">{{ section.title }}</div>
        <template v-for="(row, r) in section.letterRows" :key="`l${r}`">
          <div v-for="l in row" :key="l.option" class="text center" :style="{ left: mm(l.x - 2), top: mm(l.y - 1.8), width: mm(4), fontSize: '6.5pt' }">{{ l.option }}</div>
        </template>
        <template v-for="q in section.questions" :key="q.no">
          <div class="text" :style="{ left: mm(q.labelX), top: mm(q.y - 1.8), fontSize: '7.5pt' }">{{ q.no }}.</div>
          <div v-for="b in q.bubbles" :key="b.option" class="bubble" :style="box(b.x, b.y, BUBBLE_RADIUS * 2)"></div>
        </template>
      </template>

      <div
        v-for="(cell, i) in idCells()"
        v-show="encodeId(exam.id, student?.id ?? 0, counts)[i]"
        :key="`id${i}`"
        class="ink"
        :style="square(cell.x, cell.y, ID_CELL.size)"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: relative;
  width: 210mm;
  height: 297mm;
  margin: 0 auto 16px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15);
  color: #111;
  font-family: Arial, Helvetica, sans-serif;
}
/* Solid squares drawn with borders: browsers skip background colours when printing by default */
.ink {
  position: absolute;
  box-sizing: border-box;
  border-style: solid;
  border-color: #000;
}
.bubble {
  position: absolute;
  border: 0.25mm solid #555;
  border-radius: 50%;
}
.text {
  position: absolute;
  line-height: 1.2;
  white-space: nowrap;
}
.center {
  text-align: center;
}
/* Smaller preview on phones; printing is not affected */
@media screen and (max-width: 820px) {
  .sheet {
    zoom: 0.45;
  }
}
@media print {
  .no-print {
    display: none;
  }
  .sheet {
    margin: 0;
    box-shadow: none;
    break-after: page;
  }
}
</style>

<style>
@media print {
  @page {
    size: A4;
    margin: 0;
  }
}
</style>
