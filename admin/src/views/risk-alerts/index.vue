<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-select v-model="query.level" placeholder="预警等级" clearable style="width: 140px">
          <el-option label="一级（红）" :value="1" />
          <el-option label="二级（橙）" :value="2" />
        </el-select>
        <el-select v-model="query.status" placeholder="跟进状态" clearable style="width: 140px">
          <el-option v-for="(v, k) in ALERT_STATUS" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="muted" style="margin-left: auto">
          状态机：待跟进 → 跟进中/误报；跟进中 → 已解决/误报（非法流转将被后端拒绝）
        </span>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="等级" width="110">
          <template #default="{ row }">
            <el-tag :type="row.level === 1 ? 'danger' : 'warning'" effect="dark">
              {{ row.level === 1 ? '一级（红）' : '二级（橙）' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="用户（脱敏）" width="130" />
        <el-table-column prop="triggerWords" label="触发关键词" min-width="200" show-overflow-tooltip />
        <el-table-column prop="conversationId" label="关联会话" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="ALERT_STATUS[row.status]?.type">{{ ALERT_STATUS[row.status]?.label || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="handledBy" label="跟进人" width="110">
          <template #default="{ row }">{{ row.handledBy || '—' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="跟进备注" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上报时间" width="170" />
        <el-table-column prop="updatedAt" label="更新时间" width="170" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canHandle && (ALERT_TRANSITIONS[row.status]?.length || 0) > 0"
              type="primary"
              link
              @click="openHandle(row)"
            >
              跟进
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        class="el-pagination table-pager"
        @current-change="load()"
        @size-change="load(1)"
      />
    </el-card>

    <!-- 跟进对话框 -->
    <el-dialog v-model="dialogVisible" title="更新跟进状态" width="480px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small" class="handle-desc">
          <el-descriptions-item label="预警编号">{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="等级">
            <el-tag :type="current.level === 1 ? 'danger' : 'warning'" effect="dark">
              {{ current.level === 1 ? '一级（红）' : '二级（橙）' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="触发关键词">{{ current.triggerWords }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="ALERT_STATUS[current.status]?.type">{{ ALERT_STATUS[current.status]?.label }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-form label-width="80px" style="margin-top: 16px">
          <el-form-item label="流转到">
            <el-radio-group v-model="handleForm.status">
              <el-radio-button v-for="s in nextStatuses" :key="s.value" :value="s.value">
                {{ s.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="跟进备注">
            <el-input v-model="handleForm.remark" type="textarea" :rows="3" placeholder="记录外呼情况、转介结果等（选填）" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getRiskAlerts, updateRiskAlert } from '@/api/admin'
import { ALERT_STATUS, ALERT_TRANSITIONS } from '@/constants/risk'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canHandle = store.has('alerts:handle')

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 10, level: '', status: '' })

async function load(p) {
  if (p) query.page = p
  loading.value = true
  try {
    const data = await getRiskAlerts({ ...query })
    rows.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.level = ''
  query.status = ''
  load(1)
}

// ---------- 跟进 ----------
const dialogVisible = ref(false)
const saving = ref(false)
const current = ref(null)
const handleForm = reactive({ status: '', remark: '' })

const nextStatuses = computed(() =>
  (ALERT_TRANSITIONS[current.value?.status] || []).map((s) => ({ value: s, label: ALERT_STATUS[s].label }))
)

function openHandle(row) {
  current.value = row
  handleForm.status = ''
  handleForm.remark = row.remark || ''
  dialogVisible.value = true
}

async function save() {
  if (!handleForm.status) {
    ElMessage.warning('请选择要流转到的状态')
    return
  }
  saving.value = true
  try {
    await updateRiskAlert(current.value.id, {
      status: handleForm.status,
      handledBy: store.username,
      remark: handleForm.remark
    })
    ElMessage.success('跟进状态已更新')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(() => load())
</script>

<style scoped>
.handle-desc {
  width: 100%;
}
</style>
