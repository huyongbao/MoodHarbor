<template>
  <div class="page">
    <el-card shadow="never" class="intro-card">
      <span class="muted">
        展示小程序端用户与数字心理疏导师对话后沉淀的长期记忆（Mem0），按用户聚合、内容已脱敏；
        用户在小程序端一键清除后，对应记忆同步删除。数据由对话结束写入、下次对话开始时检索拼入 Prompt。
      </span>
    </el-card>

    <el-row :gutter="16">
      <!-- 左：产生记忆的用户列表 -->
      <el-col :span="8">
        <el-card shadow="never" v-loading="listLoading">
          <el-input
            v-model="keyword"
            placeholder="搜索昵称"
            clearable
            :prefix-icon="Search"
            @input="onSearch"
          />
          <div class="user-list">
            <div
              v-for="g in groupList"
              :key="g.userId"
              class="user-item"
              :class="{ active: g.userId === currentUserId }"
              @click="selectUser(g.userId)"
            >
              <div class="user-item-head">
                <span class="user-item-name">{{ g.nickname }}</span>
                <el-tag size="small" type="primary" effect="plain">{{ g.digitalHumanName }}</el-tag>
              </div>
              <div class="user-item-sub">
                <span>{{ g.occupation }}</span>
                <span class="mem-count">{{ g.totalMemories }} 条记忆</span>
              </div>
              <div class="user-item-sub muted">最近更新 {{ shortTime(g.lastMemoryAt) }}</div>
            </div>
            <el-empty v-if="!listLoading && !groupList.length" description="暂无产生记忆的用户" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 右：该用户的记忆时间线 -->
      <el-col :span="16">
        <el-card shadow="never" v-loading="detailLoading">
          <template v-if="detail.user">
            <div class="detail-head">
              <span class="detail-name">{{ detail.user.nickname }}</span>
              <el-tag effect="plain" size="small">{{ detail.user.occupation }}</el-tag>
              <el-tag type="primary" effect="plain" size="small">数字人：{{ detail.user.digitalHumanName }}</el-tag>
              <el-tag type="info" effect="plain" size="small">{{ items.length }} 条记忆</el-tag>
              <span class="muted detail-hint">记忆随对话自动沉淀，仅用于个性化陪伴，已脱敏</span>
            </div>
            <el-timeline v-if="items.length" class="mem-timeline">
              <el-timeline-item
                v-for="m in items"
                :key="m.id"
                :type="typeMeta(m.type).timeline"
                :timestamp="m.createdAt"
                placement="top"
              >
                <div class="mem-item">
                  <el-tag :type="typeMeta(m.type).tag" size="small" effect="dark">{{ m.type }}</el-tag>
                  <p class="mem-content">{{ m.content }}</p>
                  <div class="muted">
                    来源：{{ m.sourceId ? `会话「${m.sourceTitle}」（${m.sourceId}）` : '跨会话聚合' }}
                    · 置信度 {{ Math.round(m.confidence * 100) }}%
                  </div>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="该用户暂无记忆" :image-size="80" />
          </template>
          <el-empty v-else-if="!detailLoading" description="请在左侧选择用户查看记忆" :image-size="100" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getUserMemories, getUserMemoryDetail } from '@/api/admin'

// ---------- 左侧用户列表 ----------
const listLoading = ref(false)
const keyword = ref('')
const groupList = ref([])
const currentUserId = ref(null)

let searchTimer = null
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadGroups, 300)
}

async function loadGroups() {
  listLoading.value = true
  try {
    groupList.value = await getUserMemories({ keyword: keyword.value })
    // 默认选中第一个用户；搜索后若当前选中用户仍存在则保持
    if (groupList.value.length) {
      const keep = groupList.value.find((g) => g.userId === currentUserId.value)
      await selectUser(keep ? keep.userId : groupList.value[0].userId)
    } else {
      currentUserId.value = null
      detail.user = null
      items.value = []
    }
  } catch {
    /* 错误已由拦截器统一提示 */
  } finally {
    listLoading.value = false
  }
}

// ---------- 右侧记忆详情 ----------
const detailLoading = ref(false)
const detail = ref({})
const items = ref([])

async function selectUser(userId) {
  currentUserId.value = userId
  detailLoading.value = true
  try {
    const data = await getUserMemoryDetail(userId)
    detail.value = data
    items.value = data.items || []
  } catch {
    detail.value = {}
    items.value = []
    ElMessage.error('记忆明细加载失败')
  } finally {
    detailLoading.value = false
  }
}

// 记忆类型 → 标签颜色 / 时间线节点颜色
function typeMeta(type) {
  const map = {
    情绪趋势: { tag: 'warning', timeline: 'warning' },
    关键事件: { tag: 'danger', timeline: 'danger' },
    偏好: { tag: 'success', timeline: 'success' },
    关注话题: { tag: 'primary', timeline: 'primary' }
  }
  return map[type] || { tag: 'info', timeline: '' }
}

function shortTime(t) {
  return t ? String(t).slice(5, 16) : '-'
}

onMounted(loadGroups)
</script>

<style scoped>
.intro-card {
  margin-bottom: 16px;
}
.intro-card :deep(.el-card__body) {
  padding: 12px 16px;
}
.user-list {
  margin-top: 12px;
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}
.user-item {
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.user-item:hover {
  border-color: #409eff;
}
.user-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}
.user-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.user-item-name {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.user-item-sub {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #606266;
}
.mem-count {
  color: #409eff;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
}
.detail-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.detail-hint {
  margin-left: auto;
}
.mem-timeline {
  padding-left: 4px;
}
.mem-item .mem-content {
  margin: 6px 0;
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}
</style>
