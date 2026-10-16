<template>
  <div class="login-bg">
    <el-card class="login-card">
      <div class="brand">
        <div class="brand-logo">🌳</div>
        <h1 class="brand-title">情绪树洞 · 管理后台</h1>
        <p class="brand-sub">守护每一位新就业形态劳动者的心事</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" autocomplete="username" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="submit">登 录</el-button>
      </el-form>

      <el-divider class="demo-divider">演示账号（Mock 模式）</el-divider>
      <div class="demo-accounts">
        <el-tag class="demo-tag" type="danger" effect="plain" @click="fill('superadmin', 'admin123')">
          超级管理员 superadmin / admin123
        </el-tag>
        <el-tag class="demo-tag" type="primary" effect="plain" @click="fill('operator', 'operator123')">
          运营人员 operator / operator123
        </el-tag>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login } from '@/api/admin'
import { useUserStore } from '@/stores/user'

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const router = useRouter()
const route = useRoute()
const store = useUserStore()

function fill(u, p) {
  form.username = u
  form.password = p
}

async function submit() {
  await formRef.value.validate().catch(() => Promise.reject())
  loading.value = true
  try {
    const data = await login({ username: form.username, password: form.password })
    store.setAuth({
      token: data.token,
      username: data.user.username,
      roleName: data.user.roleName,
      permissions: data.user.permissions
    })
    ElMessage.success(`欢迎回来，${data.user.roleName} ${data.user.username}`)
    router.push(route.query.redirect || '/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-bg {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fdf1e7 0%, #e8f4f8 55%, #eef7ee 100%);
}
.login-card {
  width: 400px;
  border-radius: 12px;
}
.brand {
  text-align: center;
  margin-bottom: 20px;
}
.brand-logo {
  font-size: 44px;
}
.brand-title {
  font-size: 20px;
  margin: 8px 0 4px;
  color: #303133;
}
.brand-sub {
  margin: 0;
  font-size: 13px;
  color: #909399;
}
.submit {
  width: 100%;
  letter-spacing: 6px;
}
.demo-divider {
  margin: 20px 0 12px;
}
.demo-accounts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.demo-tag {
  cursor: pointer;
  width: fit-content;
}
</style>
