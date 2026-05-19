import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

import Dashboard from '../pages/Dashboard.vue'
import Login from '../pages/Login.vue'
import Register from '../pages/Register.vue'
import Classes from '../pages/Classes.vue'
import ClassDetail from '../pages/ClassDetail.vue'
import Students from '../pages/Students.vue'
import StudentDetail from '../pages/StudentDetail.vue'
import Exams from '../pages/Exams.vue'
import ExamDetail from '../pages/ExamDetail.vue'
import ExamResults from '../pages/ExamResults.vue'
import Grade from '../pages/Grade.vue'
import Reports from '../pages/Reports.vue'
import NotFound from '../pages/NotFound.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard, meta: { requiresAuth: true } },
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/classes', component: Classes, meta: { requiresAuth: true } },
    { path: '/classes/:id', component: ClassDetail, meta: { requiresAuth: true } },
    { path: '/students', component: Students, meta: { requiresAuth: true } },
    { path: '/students/:id', component: StudentDetail, meta: { requiresAuth: true } },
    { path: '/exams', component: Exams, meta: { requiresAuth: true } },
    { path: '/exams/:id', component: ExamDetail, meta: { requiresAuth: true } },
    { path: '/exams/:id/results', component: ExamResults, meta: { requiresAuth: true } },
    { path: '/grade', component: Grade, meta: { requiresAuth: true } },
    { path: '/reports', component: Reports, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', component: NotFound }
  ]
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore()
  if (!auth.token) {
    auth.loadToken()
  }
  if (!auth.token) {
    return '/login'
  }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      return '/login'
    }
  }
  return true
})

export default router
