import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { whoami } from '@/api/admin'
import Layout from '@/layout/index.vue'

/**
 * 路由表：meta.permission 对应 RBAC 权限标识，守卫统一校验。
 */
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '数据驾驶舱', permission: 'dashboard:view' }
      },
      {
        path: 'users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: '注册用户管理', permission: 'users:view' }
      },
      {
        path: 'conversations',
        component: () => import('@/views/conversations/index.vue'),
        meta: { title: '心理倾诉记录', permission: 'conversations:view' }
      },
      {
        path: 'risk-alerts',
        component: () => import('@/views/risk-alerts/index.vue'),
        meta: { title: '预警记录', permission: 'alerts:view' }
      },
      {
        path: 'debug/multimodal',
        component: () => import('@/views/debug/multimodal.vue'),
        meta: { title: '多模态感知调试', permission: 'debug:multimodal' }
      },
      {
        path: 'debug/intervention',
        component: () => import('@/views/debug/intervention.vue'),
        meta: { title: '转介干预配置', permission: 'debug:intervention' }
      },
      {
        path: 'debug/digital-humans',
        component: () => import('@/views/debug/digital-humans.vue'),
        meta: { title: '数字心理疏导师', permission: 'debug:digital-human' }
      },
      {
        path: 'debug/resources',
        component: () => import('@/views/debug/resources.vue'),
        meta: { title: '心理健康自助资源库', permission: 'debug:resources' }
      },
      {
        path: 'debug/memories',
        component: () => import('@/views/debug/memories.vue'),
        meta: { title: '用户记忆', permission: 'debug:memories' }
      },
      {
        path: 'accounts',
        component: () => import('@/views/accounts/index.vue'),
        meta: { title: '后台账号管理', permission: 'accounts:manage' }
      },
      {
        path: 'roles',
        component: () => import('@/views/roles/index.vue'),
        meta: { title: '角色权限', permission: 'roles:manage' }
      }
    ]
  },
  {
    path: '/403',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限', public: true }
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在', public: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 首次导航时静默同步一次最新权限：旧会话持久化的权限列表可能已过期
// （如新增了菜单权限），不刷新会导致菜单缺失或误判 403
let authSynced = false

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} · 歇会儿管理后台` : '歇会儿管理后台'
  const store = useUserStore()

  if (to.meta.public) {
    if (to.path === '/login' && store.isLoggedIn) return '/dashboard'
    return true
  }
  if (!store.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (!authSynced) {
    authSynced = true
    try {
      const user = await whoami()
      store.setAuth({ token: store.token, ...user })
    } catch {
      // 401 由 request 拦截器统一清凭证；此处直接回登录页，
      // 不能继续走下方权限判断（权限已被清空，会误报 403）
      if (!store.isLoggedIn) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }
  }
  if (to.meta.permission && !store.has(to.meta.permission)) {
    ElMessage.error('无权限访问该页面')
    return '/403'
  }
  return true
})

export default router
