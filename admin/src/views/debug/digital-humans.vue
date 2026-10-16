<template>
  <div class="page">
    <div class="filter-bar">
      <span class="muted">数字人内置固定两位（一男一女），形象由系统统一管理，仅支持编辑 Prompt 与启用状态</span>
    </div>

    <el-row v-loading="loading" :gutter="16">
      <el-col v-for="dh in rows" :key="dh.id" :span="12" style="margin-bottom: 16px">
        <el-card shadow="never" class="dh-card">
          <div class="dh-head">
            <div class="dh-avatar">
              <img :src="dh.avatar" :alt="dh.name" />
            </div>
            <div class="dh-info">
              <div class="dh-name">
                {{ dh.name }}
                <el-tag size="small" effect="plain">{{ dh.gender || '未标注' }}</el-tag>
              </div>
              <el-switch
                :model-value="dh.status === 'active'"
                inline-prompt
                active-text="启用"
                inactive-text="停用"
                @change="(v) => toggleStatus(dh, v)"
              />
            </div>
          </div>
          <div class="dh-prompt">{{ dh.prompt || '（未配置 Prompt）' }}</div>
          <div class="dh-actions">
            <el-button type="primary" plain size="small" @click="openEdit(dh)">编辑 Prompt</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" title="编辑数字人" width="560px">
      <el-form label-width="90px">
        <el-form-item label="Prompt">
          <el-input
            v-model="form.prompt"
            type="textarea"
            :rows="6"
            placeholder="角色设定：语气、共情策略、干预遵循四级策略等"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getDigitalHumans, updateDigitalHuman } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const rows = ref([])

async function load() {
  loading.value = true
  try {
    rows.value = await getDigitalHumans()
  } finally {
    loading.value = false
  }
}

const dialogVisible = ref(false)
const form = reactive({ id: null, prompt: '', active: false })

function openEdit(dh) {
  Object.assign(form, { id: dh.id, prompt: dh.prompt, active: dh.status === 'active' })
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    await updateDigitalHuman(form.id, { prompt: form.prompt, status: form.active ? 'active' : 'inactive' })
    ElMessage.success('已保存')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(dh, v) {
  await updateDigitalHuman(dh.id, { status: v ? 'active' : 'inactive' })
  dh.status = v ? 'active' : 'inactive'
  ElMessage.success(v ? '已启用' : '已停用')
}

onMounted(load)
</script>

<style scoped>
.dh-card :deep(.el-card__body) {
  padding: 16px;
}
.dh-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.dh-avatar {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  overflow: hidden;
  background: #f5f7fa;
  flex-shrink: 0;
}
.dh-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.dh-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dh-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.dh-prompt {
  margin-top: 12px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  height: 96px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
.dh-actions {
  margin-top: 10px;
  text-align: right;
}
.muted {
  color: #909399;
  font-size: 12px;
}
</style>
