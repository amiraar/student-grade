export function sanitizeTeacher(teacher) {
  return { id: teacher.id, name: teacher.name, email: teacher.email }
}
