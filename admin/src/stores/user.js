/**
 * 登录用户状态：token + 身份 + 权限标识（登录接口下发，见 PRD 七 /admin/login）。
 * 权限判定统一走 has()，路由守卫与 v-permission 指令共用。
 */
import { defineStore } from 'pinia'

const KEY = {
  token: 'mh_admin_token',
  username: 'mh_admin_username',
  roleName: 'mh_admin_roleName',
  permissions: 'mh_admin_permissions'
}

function readJSON(k, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback
  } catch {
    return fallback
  }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(KEY.token) || '',
    username: localStorage.getItem(KEY.username) || '',
    roleName: localStorage.getItem(KEY.roleName) || '',
    permissions: readJSON(KEY.permissions)
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    has: (s) => (perm) => s.permissions.includes(perm)
  },
  actions: {
    setAuth({ token, username, roleName, permissions }) {
      this.token = token
      this.username = username
      this.roleName = roleName
      this.permissions = permissions || []
      localStorage.setItem(KEY.token, token)
      localStorage.setItem(KEY.username, username)
      localStorage.setItem(KEY.roleName, roleName)
      localStorage.setItem(KEY.permissions, JSON.stringify(this.permissions))
    },
    clearAuth() {
      this.token = ''
      this.username = ''
      this.roleName = ''
      this.permissions = []
      Object.values(KEY).forEach((k) => localStorage.removeItem(k))
    }
  }
})
