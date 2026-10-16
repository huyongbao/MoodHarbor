<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-button type="primary" :icon="Plus" @click="openHotline()">新增热线</el-button>
      </div>
      <el-table v-loading="hotlineLoading" :data="hotlines" stripe>
        <el-table-column prop="name" label="名称" min-width="210" />
        <el-table-column prop="phone" label="号码" width="150" />
        <el-table-column prop="audience" label="适用人群" width="110">
          <template #default="{ row }">
            <el-tag effect="plain">{{ row.audience || '全部用户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="适用等级" width="100">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" effect="dark">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openHotline(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 热线编辑对话框 -->
    <el-dialog v-model="hotlineDialog" :title="hotlineForm.id ? '编辑热线' : '新增热线'" width="480px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="hotlineForm.name" placeholder="如：全国统一心理援助热线" />
        </el-form-item>
        <el-form-item label="号码" required>
          <el-input v-model="hotlineForm.phone" placeholder="如：12356" />
        </el-form-item>
        <el-form-item label="适用人群">
          <el-input v-model="hotlineForm.audience" placeholder="如：妇女 / 青少年 / 职工群体，留空默认全部用户" />
        </el-form-item>
        <el-form-item label="适用等级">
          <el-select v-model="hotlineForm.level" style="width: 100%">
            <el-option label="高危" value="高危" />
            <el-option label="中危" value="中危" />
            <el-option label="低危" value="低危" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="hotlineForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="hotlineForm.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="hotlineDialog = false">取消</el-button>
        <el-button type="primary" :loading="hotlineSaving" @click="saveHotline">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getHotlines, createHotline, updateHotline } from '@/api/admin'

// ---------- 热线 ----------
const hotlineLoading = ref(false)
const hotlineSaving = ref(false)
const hotlines = ref([])
const hotlineDialog = ref(false)
const hotlineForm = reactive({ id: null, name: '', phone: '', audience: '', level: '高危', description: '', active: true })

function levelTagType(level) {
  return { 高危: 'danger', 中危: 'warning', 低危: 'primary' }[level] || 'info'
}

async function loadHotlines() {
  hotlineLoading.value = true
  try {
    hotlines.value = await getHotlines()
  } finally {
    hotlineLoading.value = false
  }
}

function openHotline(row) {
  if (row) {
    Object.assign(hotlineForm, row, { active: row.status === 'active' })
  } else {
    Object.assign(hotlineForm, { id: null, name: '', phone: '', audience: '', level: '高危', description: '', active: true })
  }
  hotlineDialog.value = true
}

async function saveHotline() {
  if (!hotlineForm.name || !hotlineForm.phone) {
    ElMessage.warning('名称与号码必填')
    return
  }
  hotlineSaving.value = true
  try {
    const payload = {
      name: hotlineForm.name,
      phone: hotlineForm.phone,
      audience: hotlineForm.audience || '全部用户',
      level: hotlineForm.level,
      description: hotlineForm.description,
      status: hotlineForm.active ? 'active' : 'inactive'
    }
    if (hotlineForm.id) {
      await updateHotline(hotlineForm.id, payload)
    } else {
      await createHotline(payload)
    }
    ElMessage.success('已保存')
    hotlineDialog.value = false
    loadHotlines()
  } finally {
    hotlineSaving.value = false
  }
}

onMounted(loadHotlines)
</script>
