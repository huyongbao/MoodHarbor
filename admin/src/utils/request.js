/**
 * 统一请求封装：JWT 注入 + 业务 code 剥壳 + 401 处理。
 * 约定（PRD 8.1）：body code 0=成功；401 跳登录；其余弹错并 reject。
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { useUserStore } from '@/stores/user'
import { setupMock } from '@/mock'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 15000
})

// Mock 开关：后端未就绪时前端独立联调（.env.development 默认开启）
if (String(import.meta.env.VITE_USE_MOCK) === 'true') {
  setupMock(request)
}

request.interceptors.request.use((config) => {
  const store = useUserStore()
  if (store.token) {
    config.headers.Authorization = `Bearer ${store.token}`
  }
  return config
})

function handleUnauthorized() {
  const store = useUserStore()
  store.clearAuth()
  if (router.currentRoute.value.path !== '/login') {
    router.push('/login')
  }
}

// 相同错误 3 秒内只提示一次：调试台推流失败是高频事件，否则会刷屏
let lastErrMsg = ''
let lastErrAt = 0
function toastError(msg) {
  const now = Date.now()
  if (msg === lastErrMsg && now - lastErrAt < 3000) return
  lastErrMsg = msg
  lastErrAt = now
  ElMessage.error(msg)
}

request.interceptors.response.use(
  (res) => {
    const body = res.data || {}
    if (body.code === 0) return body.data
    if (body.code === 401) handleUnauthorized()
    if (!res.config?.silent) toastError(body.message || '请求失败')
    return Promise.reject(new Error(body.message || `业务错误 code=${body.code}`))
  },
  (err) => {
    const status = err.response?.status
    const body = err.response?.data
    if (status === 401 || body?.code === 401) handleUnauthorized()
    // silent: 后台采集类请求（推流帧/音频段）失败不打扰用户
    if (!err.config?.silent) toastError(body?.message || err.message || '网络错误')
    return Promise.reject(err)
  }
)

export default request
