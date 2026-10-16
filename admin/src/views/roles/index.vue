<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <span class="muted">
          权限矩阵对齐 PRD 七：超级管理员=全部；运营=查看类 + 预警跟进。变更保存后重新登录完全生效。
        </span>
      </div>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="label" label="角色" width="140">
          <template #default="{ row }">
            <el-tag :type="row.name === 'superadmin' ? 'danger' : 'primary'" effect="dark">{{ row.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="标识" width="120" />
        <el-table-column prop="description" label="说明" min-width="200" />
        <el-table-column label="权限数" width="90">
          <template #default="{ row }">{{ row.permissions.length }} / {{ ALL_PERMISSIONS.length }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row)">配置权限</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="`配置权限 · ${current?.label || ''}`" width="640px">
      <el-checkbox-group v-model="checked">
        <div v-for="group in PERMISSION_GROUPS" :key="group.module" class="perm-group">
          <div class="perm-module">{{ group.module }}</div>
          <el-checkbox v-for="p in group.perms" :key="p.key" :value="p.key" class="perm-item">
            {{ p.label }}（{{ p.key }}）
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getRoles, updateRole } from '@/api/admin'
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '@/constants/permissions'

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const dialogVisible = ref(false)
const current = ref(null)
const checked = ref([])

async function load() {
  loading.value = true
  try {
    rows.value = await getRoles()
  } finally {
    loading.value = false
  }
}

function openEdit(row) {
  current.value = row
  checked.value = [...row.permissions]
  dialogVisible.value = true
}

async function save() {
  if (!checked.value.length) {
    ElMessage.warning('至少保留一项权限')
    return
  }
  saving.value = true
  try {
    await updateRole(current.value.id, { permissions: checked.value })
    ElMessage.success('权限已保存')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.perm-group {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}
.perm-module {
  width: 90px;
  font-weight: 600;
  color: #303133;
  font-size: 13px;
  padding-top: 2px;
}
.perm-item {
  width: 220px;
  margin-right: 8px;
}
</style>
