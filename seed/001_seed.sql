INSERT INTO teachers (name, email, password)
VALUES
  ('Admin Guru', 'guru@example.com', '$2a$10$OA6N5jqETble6j5wWD8N2Okqd40xjWM0UXfKJ5tAGJ9yLSAfcS3Xa');

INSERT INTO classes (teacher_id, name, academic_year, semester)
VALUES
  (1, 'X IPA 1', '2025/2026', 1),
  (1, 'X IPA 2', '2025/2026', 1);

INSERT INTO students (class_id, teacher_id, name, nis)
VALUES
  (1, 1, 'Andi Saputra', 'NIS001'),
  (1, 1, 'Bunga Lestari', 'NIS002'),
  (1, 1, 'Cahyo Pratama', 'NIS003'),
  (1, 1, 'Dewi Kartika', 'NIS004'),
  (1, 1, 'Eko Nugroho', 'NIS005'),
  (2, 1, 'Fajar Maulana', 'NIS006'),
  (2, 1, 'Gita Ramadhani', 'NIS007'),
  (2, 1, 'Hana Pramesti', 'NIS008'),
  (2, 1, 'Indra Saputra', 'NIS009'),
  (2, 1, 'Joko Santoso', 'NIS010');
