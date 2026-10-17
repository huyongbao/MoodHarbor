<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span class="logo-icon">🌳</span>
        <span>歇会儿 · 管理后台</span>
      </div>
      <el-menu
        router
        :default-active="$route.path"
        background-color="#0f1c2e"
        text-color="#a3b1c6"
        active-text-color="#ffffff"
        class="menu"
      >
        <el-menu-item v-if="store.has('dashboard:view')" index="/dashboard">
          <el-icon><Odometer /></el-icon><span>数据驾驶舱</span>
        </el-menu-item>

        <el-sub-menu v-if="store.has('users:view')" index="g-users">
          <template #title><el-icon><User /></el-icon><span>用户管理</span></template>
          <el-menu-item index="/users">注册用户</el-menu-item>
          <el-menu-item v-if="store.has('conversations:view')" index="/conversations">倾诉记录</el-menu-item>
        </el-sub-menu>

        <el-menu-item v-if="store.has('alerts:view')" index="/risk-alerts">
          <el-icon><Bell /></el-icon>
          <span>预警记录</span>
          <el-badge v-if="pendingCount" :value="pendingCount" class="menu-badge" />
        </el-menu-item>

        <el-sub-menu v-if="store.has('debug:multimodal')" index="g-debug">
          <template #title><el-icon><Monitor /></el-icon><span>调试台</span></template>
          <el-menu-item index="/debug/multimodal">多模态感知调试</el-menu-item>
          <el-menu-item v-if="store.has('debug:intervention')" index="/debug/intervention">转介干预配置</el-menu-item>
          <el-menu-item v-if="store.has('debug:digital-human')" index="/debug/digital-humans">数字心理疏导师</el-menu-item>
          <el-menu-item v-if="store.has('debug:resources')" index="/debug/resources">心理健康自助资源库</el-menu-item>
          <el-menu-item v-if="store.has('debug:memories')" index="/debug/memories">用户记忆</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="store.has('accounts:manage')" index="g-sys">
          <template #title><el-icon><Setting /></el-icon><span>系统管理</span></template>
          <el-menu-item index="/accounts">账号管理</el-menu-item>
          <el-menu-item v-if="store.has('roles:manage')" index="/roles">角色权限</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header" height="56px">
        <div class="header-title">{{ $route.meta.title || '' }}</div>
        <el-dropdown @command="onCommand">
          <span class="user-entry">
            <el-tag size="small" :type="store.roleName === '超级管理员' ? 'danger' : 'primary'" effect="dark">
              {{ store.roleName || '访客' }}
            </el-tag>
            <span class="user-name">{{ store.username }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getRiskAlerts } from '@/api/admin'

const store = useUserStore()
const router = useRouter()

// 侧边栏待跟进预警数提醒（运营每天盯的数字）
const pendingRaw = ref(0)
const pendingCount = computed(() => pendingRaw.value || '')

let timer = null
async function refreshPending() {
  if (!store.has('alerts:view')) return
  try {
    const data = await getRiskAlerts({ status: 'pending', page: 1, pageSize: 1 })
    pendingRaw.value = data.total
  } catch {
    /* 忽略 */
  }
}

onMounted(() => {
  refreshPending()
  timer = setInterval(refreshPending, 60000)
})
onBeforeUnmount(() => clearInterval(timer))

function onCommand(cmd) {
  if (cmd === 'logout') {
    store.clearAuth()
    router.push('/login')
  }
}
</script>

<style scoped>
.layout {
  height: 100%;
}
.aside {
  background-color: #0f1c2e;
  display: flex;
  flex-direction: column;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.logo-icon {
  font-size: 20px;
}
.menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
}
.menu-badge {
  margin-left: 8px;
}
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.user-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.user-name {
  font-size: 14px;
  color: #303133;
}
.main {
  padding: 0;
  background: #f5f7fa;
}
</style>
