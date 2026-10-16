<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="昵称/手机号（脱敏后匹配）" clearable style="width: 220px" @keyup.enter="load(1)" />
        <el-select v-model="query.occupation" placeholder="职业" clearable style="width: 150px">
          <el-option v-for="o in occupations" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option label="正常" value="active" />
          <el-option label="已封禁" value="banned" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="muted" style="margin-left: auto">真实姓名与手机号已在接口层脱敏（开发计划阶段五）</span>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="nickname" label="昵称（脱敏）" width="130" />
        <el-table-column prop="phone" label="手机号（脱敏）" width="130" />
        <el-table-column prop="age" label="年龄" width="70" />
        <el-table-column prop="gender" label="性别" width="70" />
        <el-table-column prop="occupation" label="职业" width="110" />
        <el-table-column prop="digitalHumanName" label="数字人" width="90" />
        <el-table-column prop="totalConversations" label="倾诉次数" width="90" />
        <el-table-column prop="totalMinutes" label="总时长(分)" width="100" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
              {{ row.status === 'active' ? '正常' : '已封禁' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="170" />
        <el-table-column prop="lastActiveAt" label="最近活跃" width="170" />
        <el-table-column v-if="canEdit" label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-popconfirm
              :title="row.status === 'active' ? '确认封禁该用户？' : '确认解除封禁？'"
              @confirm="toggleBan(row)"
            >
              <template #reference>
                <el-button :type="row.status === 'active' ? 'danger' : 'success'" link>
                  {{ row.status === 'active' ? '封禁' : '解封' }}
                </el-button>
              </template>
            </el-popconfirm>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getUsers, updateUserStatus } from '@/api/admin'
import { useUserStore } from '@/stores/user'

const store = useUserStore()
const canEdit = store.has('users:edit')

const occupations = ['外卖骑手', '快递员', '网约车司机', '其他新就业形态']
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 10, keyword: '', occupation: '', status: '' })

async function load(p) {
  if (p) query.page = p
  loading.value = true
  try {
    const data = await getUsers({ ...query })
    rows.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.keyword = ''
  query.occupation = ''
  query.status = ''
  load(1)
}

async function toggleBan(row) {
  const next = row.status === 'active' ? 'banned' : 'active'
  await updateUserStatus(row.id, { status: next })
  ElMessage.success(next === 'banned' ? '已封禁' : '已解封')
  load()
}

onMounted(() => load())
</script>
