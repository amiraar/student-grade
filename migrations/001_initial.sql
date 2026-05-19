CREATE TABLE teachers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE classes (
  id             SERIAL PRIMARY KEY,
  teacher_id     INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  academic_year  VARCHAR(20) NOT NULL,
  semester       SMALLINT NOT NULL CHECK (semester IN (1, 2)),
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE students (
  id          SERIAL PRIMARY KEY,
  class_id    INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  nis         VARCHAR(50) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE exams (
  id           SERIAL PRIMARY KEY,
  class_id     INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  exam_date    DATE NOT NULL,
  answer_key   JSONB NOT NULL,
  weights      JSONB NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE results (
  id             SERIAL PRIMARY KEY,
  exam_id        INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  student_id     INTEGER REFERENCES students(id) ON DELETE CASCADE,
  answers        JSONB NOT NULL,
  score          NUMERIC(5,2) NOT NULL,
  grade          VARCHAR(2) NOT NULL,
  detail         JSONB NOT NULL,
  sheet_quality  VARCHAR(50),
  image_path     VARCHAR(500),
  graded_at      TIMESTAMP DEFAULT NOW(),
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

CREATE INDEX idx_results_exam_id ON results(exam_id);
CREATE INDEX idx_results_student_id ON results(student_id);
CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_exams_class_id ON exams(class_id);
