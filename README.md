# Student Grade (Full Stack)

Aplikasi manajemen kelas, ujian, dan koreksi lembar jawaban otomatis berbasis Gemini Vision.

## Fitur Utama
- Auth guru (login + registrasi)
- Manajemen kelas, siswa, dan ujian
- Lembar jawaban siap cetak per ujian (satu lembar per siswa, nama + ID tercetak)
- Koreksi lembar template tanpa AI: foto banyak lembar sekaligus, siswa dikenali otomatis, jawaban ragu ditandai untuk dicek guru
- Koreksi lembar lain dengan Gemini Vision (cadangan)
- Tabel per soal yang bisa dikoreksi guru sebelum disimpan; input manual cepat (ketik `ABCDA-B` per bagian), nilai tampil langsung
- Aturan nilai per ujian: bobot per bagian (%) atau tabel konversi jumlah benar → nilai (mis. benar 13 → 70)
- Mengubah kunci atau aturan nilai menghitung ulang nilai yang sudah tersimpan
- Export CSV (hasil ujian, hasil siswa, laporan kelas)
- Responsive dan siap deploy di Vercel

## Struktur Proyek
- frontend/ — Vue 3 + Vite + Pinia + Vue Router + Tailwind v4
- api/ — Vercel Functions (Node.js 22). Satu file per resource (`api/exams.js`, dst.); sub-path seperti `/api/exams/5/results` diarahkan ke file itu lewat `rewrites` di `vercel.json`
- lib/ — utilitas backend
- migrations/ — schema PostgreSQL
- seed/ — data awal

## Local Development
1. Install dependencies frontend:
	- `cd frontend`
	- `npm install`
2. Install dependencies backend:
	- `npm install`
3. Jalankan API (Vercel Functions) di root:
	- `vercel dev`
4. Jalankan frontend (Vite) di folder frontend:
	- `npm run dev`
	- Dev server akan mem-proxy request `/api` ke `http://localhost:3000`

## Tes
- `npm test` — perhitungan nilai (20.000 kasus acak vs perhitungan acuan), CSV, dan pembaca lembar jawaban (foto sintetis miring/terbalik/berbayang)
- `GEMINI_API_KEY=... node scripts/test-gemini.mjs foto.jpg jawaban.json` — ukur akurasi Gemini pada foto lembar jawabanmu sendiri

## Cara koreksi (lembar template)
1. Ujian → Cetak Lembar Jawaban → cetak A4, skala 100%.
2. Siswa menghitamkan bulatan.
3. Koreksi → pilih kelas & ujian → pilih semua foto sekaligus. Foto harus memuat seluruh lembar dan 4 kotak hitam di pojok.
4. Cek jawaban yang ditandai **?**, ubah jika perlu, Simpan.

## Environment Variables (Vercel)
Tambahkan di Vercel Dashboard -> Project -> Settings -> Environment Variables:
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (opsional, default `gemini-2.0-flash`)
- `DATABASE_URL`
- `JWT_SECRET` (min. 32 karakter)
- `FRONTEND_URL`

Frontend (build-time):
- `VITE_API_BASE_URL=/api`

## Neon Database Setup
1. Buat project di Neon.
2. Copy connection string ke `DATABASE_URL`.
3. Jalankan file migrasi `migrations/001_initial.sql`.
4. Jalankan seed `seed/001_seed.sql`.

Seed akun guru:
- Email: `guru@example.com`
- Password: `password123`

## Vercel Deployment
1. Push repo ke GitHub.
2. Import ke Vercel.
3. Pastikan `vercel.json` digunakan (build command + output).
4. Tambahkan environment variables.
5. Deploy.

## API Ringkas
- Auth: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/me`
- Grading: `POST /api/grade` — body `{ exam_id, student_id, image }` (dibaca AI) atau `{ exam_id, student_id, answers }` (jawaban manual / hasil koreksi guru)
- Exams: `GET /api/exams`, `POST /api/exams`, `GET /api/exams/:id`, `PUT /api/exams/:id`, `DELETE /api/exams/:id`
- Students: `GET /api/students`, `POST /api/students`, `POST /api/students/import`, `GET /api/students/:id`, `PUT /api/students/:id`, `DELETE /api/students/:id`
- Classes: `GET /api/classes`, `POST /api/classes`, `GET /api/classes/:id`, `PUT /api/classes/:id`, `DELETE /api/classes/:id`
- Reports: `GET /api/reports/export`