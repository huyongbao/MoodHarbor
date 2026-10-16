<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索标题 / 说明"
          clearable
          style="width: 220px"
          @keyup.enter="loadList"
          @clear="loadList"
        />
        <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 140px" @change="loadList">
          <el-option v-for="t in TYPE_OPTIONS" :key="t" :label="t" :value="t" />
        </el-select>
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 120px" @change="loadList">
          <el-option label="已上架" value="active" />
          <el-option label="已下架" value="inactive" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openDialog()">新增资源</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag effect="plain">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="适用等级" width="140">
          <template #default="{ row }">
            <el-tag
              v-for="lv in row.suitableLevels || []"
              :key="lv"
              :type="lv === 2 ? 'warning' : 'primary'"
              size="small"
              style="margin-right: 4px"
            >
              {{ LEVEL_LABELS[lv] || lv }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="资源" width="90">
          <template #default="{ row }">
            <el-link v-if="row.url" :href="row.url" target="_blank" type="primary">查看</el-link>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '已上架' : '已下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDialog(row)">编辑</el-button>
            <el-button :type="row.status === 'active' ? 'warning' : 'success'" link @click="toggleStatus(row)">
              {{ row.status === 'active' ? '下架' : '上架' }}
            </el-button>
            <el-button type="danger" link @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 资源编辑对话框 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑资源' : '新增资源'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="如：三分钟呼吸放松" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="t in TYPE_OPTIONS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用等级">
          <el-checkbox-group v-model="form.suitableLevels">
            <el-checkbox :value="2">中危</el-checkbox>
            <el-checkbox :value="3">低危</el-checkbox>
          </el-checkbox-group>
          <div class="muted">高危用户由热线转介兜底，自助资源仅面向中危/低危</div>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="资源的适用场景与使用建议" />
        </el-form-item>
        <el-form-item label="资源地址">
          <el-input v-model="form.url" placeholder="填入音频所在地址（URL），如 https://cdn.example.com/audio/breath.mp3；运动/旅行建议类可留空" />
        </el-form-item>
        <el-form-item label="上架">
          <el-switch v-model="form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getResources, createResource, updateResource, deleteResource } from '@/api/admin'

const TYPE_OPTIONS = ['放松音频', '轻音乐', '冥想引导', '运动建议', '旅行建议', '文章']
const LEVEL_LABELS = { 2: '中危', 3: '低危' }

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const query = reactive({ keyword: '', type: '', status: '' })

const dialog = ref(false)
const form = reactive({ id: null, title: '', type: '放松音频', suitableLevels: [3], description: '', url: '', active: true })

async function loadList() {
  loading.value = true
  try {
    list.value = await getResources({ ...query })
  } finally {
    loading.value = false
  }
}

function openDialog(row) {
  if (row) {
    Object.assign(form, row, { active: row.status === 'active', suitableLevels: [...(row.suitableLevels || [])] })
  } else {
    Object.assign(form, { id: null, title: '', type: '放松音频', suitableLevels: [3], description: '', url: '', active: true })
  }
  dialog.value = true
}

async function save() {
  if (!form.title) {
    ElMessage.warning('标题必填')
    return
  }
  if (!form.suitableLevels.length) {
    ElMessage.warning('请至少选择一个适用等级')
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title,
      type: form.type,
      suitableLevels: form.suitableLevels,
      description: form.description,
      url: form.url,
      status: form.active ? 'active' : 'inactive'
    }
    if (form.id) {
      await updateResource(form.id, payload)
    } else {
      await createResource(payload)
    }
    ElMessage.success('已保存')
    dialog.value = false
    loadList()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  await updateResource(row.id, { status: row.status === 'active' ? 'inactive' : 'active' })
  ElMessage.success(row.status === 'active' ? '已下架' : '已上架')
  loadList()
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除资源「${row.title}」？删除后小程序端不再推荐该素材。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await deleteResource(row.id)
  ElMessage.success('已删除')
  loadList()
}

onMounted(loadList)
</script>

<style scoped>
.muted {
  color: #909399;
  font-size: 12px;
}
</style>
