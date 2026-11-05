-- NIS only has to be unique within one teacher's students. Registration is open, so two teachers
-- at different schools can have the same NIS; the global constraint refused the second one.
--
-- Run this together with the deployment that contains this change: the previous code cannot insert
-- into the new schema, and the new code cannot insert into the old one.
BEGIN;

ALTER TABLE students ADD COLUMN teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE;

UPDATE students s
SET teacher_id = c.teacher_id
FROM classes c
WHERE c.id = s.class_id;

ALTER TABLE students ALTER COLUMN teacher_id SET NOT NULL;

ALTER TABLE students DROP CONSTRAINT students_nis_key;
ALTER TABLE students ADD CONSTRAINT students_teacher_id_nis_key UNIQUE (teacher_id, nis);

COMMIT;
