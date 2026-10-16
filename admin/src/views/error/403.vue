<template>
  <div class="err">
    <el-result icon="warning" title="403" sub-title="没有权限访问该页面，请联系超级管理员">
      <template #extra>
        <el-button type="primary" @click="$router.back()">返回上一页</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.err {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
