<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增账号</el-button>
        <span class="muted">仅超级管理员可见本页（RBAC：accounts:manage）</span>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="用户名" width="160" />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <el-tag :type="row.roleId === 1 ? 'danger' : 'primary'" effect="dark">{{ row.roleName }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <template v-if="row.roleId !== 1">
              <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
              <el-button type="warning" link @click="openResetPwd(row)">重置密码</el-button>
              <el-popconfirm title="确认删除该账号？" @confirm="remove(row)">
                <template #reference>
                  <el-button type="danger" link>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
            <span v-else class="muted">内置账号，不可操作</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑账号' : '新增账号'" width="480px">
      <el-form label-width="90px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="!!form.id" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.roleId" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :value="r.id" :label="r.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.active" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwdDialogVisible" title="重置密码" width="420px">
      <el-form label-width="90px">
        <el-form-item label="账号">{{ pwdTarget?.username }}</el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getAccounts, createAccount, updateAccount, deleteAccount, getRoles } from '@/api/admin'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const roles = ref([])

async function load() {
  loading.value = true
  try {
    const [accs, rls] = await Promise.all([getAccounts(), getRoles()])
    rows.value = accs
    roles.value = rls
  } finally {
    loading.value = false
  }
}

// ---------- 新增/编辑 ----------
const dialogVisible = ref(false)
const form = reactive({ id: null, username: '', password: '', roleId: 2, active: true, remark: '' })

function openCreate() {
  Object.assign(form, { id: null, username: '', password: '', roleId: 2, active: true, remark: '' })
  dialogVisible.value = true
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    username: row.username,
    password: '',
    roleId: row.roleId,
    active: row.status === 'active',
    remark: row.remark || ''
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.id && (!form.username || !form.password)) {
    ElMessage.warning('用户名与初始密码必填')
    return
  }
  if (!form.id && form.password.length < 6) {
    ElMessage.warning('初始密码至少 6 位')
    return
  }
  saving.value = true
  try {
    if (form.id) {
      await updateAccount(form.id, {
        roleId: form.roleId,
        status: form.active ? 'active' : 'inactive',
        remark: form.remark
      })
    } else {
      await createAccount({ username: form.username, password: form.password, roleId: form.roleId, remark: form.remark })
    }
    ElMessage.success('已保存')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ---------- 重置密码 ----------
const pwdDialogVisible = ref(false)
const pwdTarget = ref(null)
const newPassword = ref('')

function openResetPwd(row) {
  pwdTarget.value = row
  newPassword.value = ''
  pwdDialogVisible.value = true
}

async function savePwd() {
  if (newPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  saving.value = true
  try {
    await updateAccount(pwdTarget.value.id, { newPassword: newPassword.value })
    ElMessage.success('密码已重置')
    pwdDialogVisible.value = false
  } finally {
    saving.value = false
  }
}

// ---------- 删除 ----------
async function remove(row) {
  if (row.username === store.username) {
    ElMessage.warning('不能删除当前登录账号')
    return
  }
  await deleteAccount(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.muted {
  color: #909399;
  font-size: 12px;
}
</style>
