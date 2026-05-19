import { defineStore } from 'pinia'
import api from '../lib/api.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null,
    user: null,
    loading: false,
    error: null
  }),
  actions: {
    loadToken() {
      this.token = localStorage.getItem('token')
    },
    async login(payload) {
      this.loading = true
      this.error = null
      const res = await api.post('/auth/login', payload)
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem('token', this.token)
      this.loading = false
    },
    async register(payload) {
      this.loading = true
      this.error = null
      const res = await api.post('/auth/register', payload)
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem('token', this.token)
      this.loading = false
    },
    async fetchMe() {
      const res = await api.get('/auth/me')
      this.user = res.data.user
    },
    async logout() {
      try {
        await api.post('/auth/logout')
      } catch {
        // ignore
      }
      this.token = null
      this.user = null
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
  }
})
