# Student Grade (Full Stack)

Aplikasi manajemen kelas, ujian, dan koreksi lembar jawaban otomatis berbasis Gemini Vision.

## Fitur Utama
- Auth guru (login + registrasi)
- Manajemen kelas, siswa, dan ujian
- Koreksi lembar jawaban dengan Gemini Vision
- Export CSV (hasil ujian, hasil siswa, laporan kelas)
- Responsive dan siap deploy di Vercel

## Struktur Proyek
- frontend/ — Vue 3 + Vite + Pinia + Vue Router + Tailwind v4
- api/ — Vercel Functions v3 (Node.js 22)
- lib/ — utilitas backend
- migrations/ — schema PostgreSQL
- seed/ — data awal

## Local Development
1. Install dependencies frontend:
	- `cd frontend`
	- `npm install`
2. Install dependencies backend:
	- `npm install`
3. Jalankan frontend:
	- `npm run dev`

## Environment Variables (Vercel)
Tambahkan di Vercel Dashboard -> Project -> Settings -> Environment Variables:
- `GEMINI_API_KEY`
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
- Grading: `POST /api/grade`
- Exams: `GET /api/exams`, `POST /api/exams`, `GET /api/exams/:id`, `PUT /api/exams/:id`, `DELETE /api/exams/:id`
- Students: `GET /api/students`, `POST /api/students`, `POST /api/students/import`, `GET /api/students/:id`, `PUT /api/students/:id`, `DELETE /api/students/:id`
- Classes: `GET /api/classes`, `POST /api/classes`, `GET /api/classes/:id`, `PUT /api/classes/:id`, `DELETE /api/classes/:id`
- Reports: `GET /api/reports/export`