<template>
  <div class="err">
    <el-result icon="info" title="404" sub-title="页面不存在">
      <template #extra>
        <el-button type="primary" @click="$router.push('/dashboard')">回到首页</el-button>
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
