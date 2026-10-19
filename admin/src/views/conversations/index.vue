<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="标题/昵称搜索" clearable style="width: 200px" @keyup.enter="load(1)" />
        <el-select v-model="query.level" placeholder="风险等级" clearable style="width: 140px">
          <el-option v-for="(v, k) in RISK_LEVELS" :key="k" :label="v.label" :value="Number(k)" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="muted" style="margin-left: auto">对话内容已在接口层脱敏，仅运营复核使用</span>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="会话ID" width="90" />
        <el-table-column prop="nickname" label="用户（脱敏）" width="130" />
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="messageCount" label="消息数" width="80" />
        <el-table-column label="风险等级" width="120">
          <template #default="{ row }">
            <el-tag :type="RISK_LEVELS[row.riskLevel]?.type">{{ RISK_LEVELS[row.riskLevel]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 15, 20, 50]"
        layout="total, sizes, prev, pager, next"
        class="el-pagination table-pager"
        @current-change="load()"
        @size-change="load(1)"
      />
    </el-card>

    <!-- 会话详情抽屉 -->
    <el-drawer v-model="drawerVisible" :title="detail ? `会话详情 · ${detail.title}` : '会话详情'" size="46%">
      <template v-if="detail">
        <div class="muted" style="margin-bottom: 12px">
          用户：{{ detail.nickname }} ｜ 消息数：{{ detail.messages.length }}
        </div>
        <div v-for="msg in detail.messages" :key="msg.id" class="msg-row" :class="msg.role">
          <div class="msg-bubble">
            <div class="msg-meta">
              <el-tag size="small" :type="msg.role === 'user' ? 'primary' : 'success'" effect="plain">
                {{ msg.role === 'user' ? '用户' : '数字人' }}
              </el-tag>
              <el-tag v-if="msg.riskLevel" size="small" :type="RISK_LEVELS[msg.riskLevel]?.type" effect="plain">
                风险{{ msg.riskLevel }}级
              </el-tag>
              <el-tag v-for="t in msg.inputTypes" :key="t" size="small" type="info" effect="plain">{{ t }}</el-tag>
              <span class="muted">{{ msg.createdAt }}</span>
            </div>
            <div class="msg-content">{{ msg.content }}</div>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { getConversations, getConversationMessages } from '@/api/admin'
import { RISK_LEVELS } from '@/constants/risk'

const route = useRoute()

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 15, keyword: '', level: '' })

async function load(p) {
  if (p) query.page = p
  loading.value = true
  try {
    const data = await getConversations({ ...query })
    rows.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.keyword = ''
  query.level = ''
  load(1)
}

const drawerVisible = ref(false)
const detail = ref(null)

async function openDetail(row) {
  drawerVisible.value = true
  detail.value = null
  detail.value = await getConversationMessages(row.id)
}

onMounted(() => {
  load()
  // 预警页/黄色观察页「对话」按钮带参跳转：直接打开对应会话抽屉
  if (route.query.conversationId) {
    openDetail({ id: route.query.conversationId })
  }
})
</script>

<style scoped>
.msg-row {
  display: flex;
  margin-bottom: 14px;
}
.msg-row.user {
  justify-content: flex-start;
}
.msg-row.assistant {
  justify-content: flex-end;
}
.msg-bubble {
  max-width: 82%;
  background: #f4f4f5;
  border-radius: 8px;
  padding: 10px 12px;
}
.msg-row.assistant .msg-bubble {
  background: #ecf5ff;
}
.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.msg-content {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
