/**
 * 管理端接口层：与 PRD 8.3 管理后台接口清单一一对应。
 * 统一响应 { code, message, data }，request 封装已剥壳，这里直接拿 data。
 */
import request from '@/utils/request'

// ---------- 管理员 ----------
export const login = (data) => request.post('/admin/login', data)
// 校验 token 并下发最新权限（用于旧会话权限同步）
export const whoami = () => request.get('/admin/whoami')

// ---------- 数据驾驶舱 ----------
export const getDashboard = () => request.get('/admin/dashboard')

// ---------- 注册用户 ----------
export const getUsers = (params) => request.get('/admin/users', { params })
// 补充接口：封禁/解封（PRD 6.2 要求支持封禁，8.3 清单未列，需与后端同步补录）
export const updateUserStatus = (id, data) => request.put(`/admin/users/${id}/status`, data)

// ---------- 倾诉记录 ----------
export const getConversations = (params) => request.get('/admin/conversations', { params })
// 补充接口：会话消息明细
export const getConversationMessages = (id) => request.get(`/admin/conversations/${id}/messages`)

// ---------- 预警记录 ----------
export const getRiskAlerts = (params) => request.get('/admin/risk-alerts', { params })
export const updateRiskAlert = (id, data) => request.put(`/admin/risk-alerts/${id}`, data)
// 预警跟进时间线（人工状态流转 + 系统自动升级留痕）
export const getAlertFollowUps = (id) => request.get(`/admin/risk-alerts/${id}/followups`)
// 三级（黄）升级评估观察列表
export const getRiskEvaluations = (params) => request.get('/admin/risk-evaluations', { params })

// ---------- 转介干预配置 ----------
export const getHotlines = () => request.get('/admin/hotlines')
export const createHotline = (data) => request.post('/admin/hotlines', data)
export const updateHotline = (id, data) => request.put(`/admin/hotlines/${id}`, data)

// ---------- 心理健康自助资源库（低危/中危自助干预素材，补充接口，需与后端同步补录） ----------
export const getResources = (params) => request.get('/admin/resources', { params })
export const createResource = (data) => request.post('/admin/resources', data)
export const updateResource = (id, data) => request.put(`/admin/resources/${id}`, data)
export const deleteResource = (id) => request.delete(`/admin/resources/${id}`)

// ---------- 数字心理疏导师（内置固定两位，仅支持编辑） ----------
export const getDigitalHumans = () => request.get('/admin/digital-humans')
export const updateDigitalHuman = (id, data) => request.put(`/admin/digital-humans/${id}`, data)

// ---------- 调试台 · 用户记忆（小程序端与数字人对话沉淀的长期记忆，按用户聚合，补充接口，需与后端同步补录） ----------
export const getUserMemories = (params) => request.get('/admin/memories', { params })
export const getUserMemoryDetail = (userId) => request.get(`/admin/memories/${userId}`)

// ---------- 后台账号与角色（仅超管） ----------
export const getAccounts = () => request.get('/admin/accounts')
export const createAccount = (data) => request.post('/admin/accounts', data)
export const updateAccount = (id, data) => request.put(`/admin/accounts/${id}`, data)
export const deleteAccount = (id) => request.delete(`/admin/accounts/${id}`)
export const getRoles = () => request.get('/admin/roles')
export const updateRole = (id, data) => request.put(`/admin/roles/${id}`, data)

// ---------- 调试台：实时风险评测（PRD 9.5，补充接口，需与后端同步补录） ----------
export const evalRisk = (data) => request.post('/admin/debug/risk-eval', data)
export const getDebugPresetCases = () => request.get('/admin/debug/preset-cases')
