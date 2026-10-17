# 小程序端（微信原生小程序）

> 本目录由队友负责开发（C 端：歇会儿小程序）。
> 管理后台代码位于仓库根目录 `admin/`，与本目录分离、互不影响。

## 约定（对齐 DEVELOPMENT_PLAN.md 阶段一）

- 仓库目录结构：单仓库三目录 `miniprogram/`（本目录）、`admin/`（管理后台）、`backend/`（后端，待创建）
- 小程序端技术栈：微信原生小程序（WXML + WXSS + JS），数字人视频流对接魔珐星云 SDK
- 接口约定：BaseURL `https://api.example.com/api/v1`，JWT Bearer Token，统一响应 `{ code, message, data }`，契约见 PRD 第 8 章
