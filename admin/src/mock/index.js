/**
 * Mock 接口层：axios-mock-adapter 模拟 PRD 8.3 全部管理端接口 + 封禁/明细/实时评测等补充接口。
 * HTTP 状态码与 body code 成对出现（PRD 8.1）：200/0、400/400、401/401、403/403。
 * 通过 .env.development 的 VITE_USE_MOCK=false 一键切换到真实后端。
 */
import MockAdapter from 'axios-mock-adapter'
import { ElMessage } from 'element-plus'
import {
  accounts,
  roles,
  users,
  conversations,
  riskAlerts,
  hotlines,
  digitalHumans,
  presetCases,
  selfHelp,
  userMemories
} from './db'
import { ALERT_TRANSITIONS, ALERT_STATUS } from '@/constants/risk'

const ok = (data = null) => [200, { code: 0, message: 'success', data }]
const fail = (code, message) => [code, { code, message, data: null }]

function paginate(list, { page = 1, pageSize = 10 } = {}) {
  const p = Math.max(1, Number(page))
  const s = Math.max(1, Number(pageSize))
  return { total: list.length, list: list.slice((p - 1) * s, p * s) }
}

function findUser(uid) {
  return users.find((u) => u.id === Number(uid))
}

function roleNameOf(roleId) {
  return roles.find((r) => r.id === roleId)?.label || '未知角色'
}

function permissionsOf(roleId) {
  return roles.find((r) => r.id === roleId)?.permissions || []
}

function nextId(list) {
  return list.reduce((m, x) => Math.max(m, x.id), 0) + 1
}

/** 调试台规则评测：模拟"模型输出 + 规则兜底"结果，仅用于前端演示 */
function ruleEval(text = '') {
  const t = String(text)
  if (/遗书|跳下去|不想活|自杀|轻生|了此一生/.test(t)) {
    return {
      riskLevel: 1,
      confidence: 0.93,
      reason: '命中极高危表达（规则兜底），语义判断存在明确危机信号',
      suggestedAction: 'emergency',
      intervention: { type: 'emergency', hotline: { name: '全国统一心理援助热线', phone: '12356' }, selfHelp: [] }
    }
  }
  if (/撑不住|没意思|垮了|崩溃|绝望|失眠|活不下去/.test(t)) {
    return {
      riskLevel: 2,
      confidence: 0.86,
      reason: '识别到绝望/躯体耗竭表述，建议热线支持并持续监测',
      suggestedAction: 'hotline',
      intervention: { type: 'hotline', hotline: { name: '全国统一心理援助热线', phone: '12356' }, selfHelp: [] }
    }
  }
  if (/投诉|罚款|气死|烦|腰伤|扣分|白跑/.test(t)) {
    return {
      riskLevel: 3,
      confidence: 0.81,
      reason: '焦虑/愤怒情绪明显，无升级信号，推荐自助资源',
      suggestedAction: 'normal',
      intervention: { type: 'normal', hotline: null, selfHelp }
    }
  }
  return {
    riskLevel: 4,
    confidence: 0.9,
    reason: '日常负面情绪，无风险，纳入长期监测',
    suggestedAction: 'monitor',
    intervention: { type: 'normal', hotline: null, selfHelp: [] }
  }
}

export function setupMock(axiosInstance) {
  const mock = new MockAdapter(axiosInstance, { delayResponse: 300 })

  // ---------- 管理员登录 ----------
  mock.onPost(/\/admin\/login$/).reply((config) => {
    const { username, password } = JSON.parse(config.data || '{}')
    const acc = accounts.find((a) => a.username === username)
    if (!acc || acc.password !== password) return fail(400, '用户名或密码错误')
    if (acc.status !== 'active') return fail(403, '账号已被禁用，请联系超级管理员')
    return ok({
      token: `mock-token-${username}-${Date.now()}`,
      user: { username, roleName: roleNameOf(acc.roleId), permissions: permissionsOf(acc.roleId) }
    })
  })

  // 校验 token 并下发最新权限（token 格式：mock-token-<username>-<时间戳>）。
  // 页面刷新后据此恢复会话，保证角色权限变更后菜单/路由即时同步，不受旧 localStorage 缓存影响
  mock.onGet(/\/admin\/whoami$/).reply((config) => {
    const token = String(config.headers?.Authorization || '')
    const m = token.match(/^Bearer mock-token-(.+)-(\d+)$/)
    const acc = m ? accounts.find((a) => a.username === m[1]) : null
    if (!acc || acc.status !== 'active') return fail(401, '未登录或登录已过期')
    return ok({ username: acc.username, roleName: roleNameOf(acc.roleId), permissions: permissionsOf(acc.roleId) })
  })

  // ---------- 数据驾驶舱 ----------
  mock.onGet(/\/admin\/dashboard$/).reply(() => {
    const pendingAlerts = riskAlerts.filter((a) => a.status === 'pending').length
    const level1Pending = riskAlerts.filter((a) => a.level === 1 && a.status !== 'resolved' && a.status !== 'false_alarm').length
    return ok({
      todayActive: 12,
      totalUsers: users.length,
      todayMinutes: 87,
      pendingAlerts,
      level1Pending,
      activeTrend: [
        { date: '10-10', active: 8, newUsers: 2 },
        { date: '10-11', active: 11, newUsers: 3 },
        { date: '10-12', active: 9, newUsers: 1 },
        { date: '10-13', active: 13, newUsers: 4 },
        { date: '10-14', active: 10, newUsers: 2 },
        { date: '10-15', active: 15, newUsers: 3 },
        { date: '10-16', active: 12, newUsers: 2 }
      ],
      minutesTrend: [
        { date: '10-10', minutes: 64 },
        { date: '10-11', minutes: 88 },
        { date: '10-12', minutes: 71 },
        { date: '10-13', minutes: 102 },
        { date: '10-14', minutes: 77 },
        { date: '10-15', minutes: 118 },
        { date: '10-16', minutes: 87 }
      ],
      emotionDist: [
        { name: '平静', value: 30 },
        { name: '焦虑', value: 27 },
        { name: '悲伤', value: 16 },
        { name: '愤怒', value: 12 },
        { name: '孤独', value: 9 },
        { name: '其他', value: 6 }
      ],
      alertLevels: [
        { level: '一级', count: riskAlerts.filter((a) => a.level === 1).length },
        { level: '二级', count: riskAlerts.filter((a) => a.level === 2).length },
        { level: '三级', count: riskAlerts.filter((a) => a.level === 3).length },
        { level: '四级', count: riskAlerts.filter((a) => a.level === 4).length }
      ]
    })
  })

  // ---------- 注册用户（脱敏列表） ----------
  mock.onGet(/\/admin\/users$/).reply((config) => {
    const { keyword = '', occupation = '', status = '', page = 1, pageSize = 10 } = config.params || {}
    let list = [...users]
    if (keyword) list = list.filter((u) => (u.nickname + u.phone).includes(keyword))
    if (occupation) list = list.filter((u) => u.occupation === occupation)
    if (status) list = list.filter((u) => u.status === status)
    return ok(paginate(list, { page, pageSize }))
  })

  mock.onPut(/\/admin\/users\/(\d+)\/status$/).reply((config) => {
    const id = Number(config.url.match(/\/admin\/users\/(\d+)\/status$/)[1])
    const { status } = JSON.parse(config.data || '{}')
    const user = findUser(id)
    if (!user) return fail(404, '用户不存在')
    if (!['active', 'banned'].includes(status)) return fail(400, '非法状态值')
    user.status = status
    return ok({ id, status })
  })

  // ---------- 倾诉记录 ----------
  mock.onGet(/\/admin\/conversations$/).reply((config) => {
    const { keyword = '', level = '', page = 1, pageSize = 10 } = config.params || {}
    let list = conversations.map((c) => ({
      id: c.id,
      userId: c.userId,
      nickname: findUser(c.userId)?.nickname || '未知用户',
      title: c.title,
      messageCount: c.messages.length,
      riskLevel: c.riskLevel,
      createdAt: c.createdAt
    }))
    if (keyword) list = list.filter((c) => (c.title + c.nickname).includes(keyword))
    if (level) list = list.filter((c) => c.riskLevel === Number(level))
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return ok(paginate(list, { page, pageSize }))
  })

  mock.onGet(/\/admin\/conversations\/([^/]+)\/messages$/).reply((config) => {
    const id = config.url.match(/\/admin\/conversations\/([^/]+)\/messages$/)[1]
    const conv = conversations.find((c) => c.id === id)
    if (!conv) return fail(404, '会话不存在')
    return ok({ id: conv.id, title: conv.title, nickname: findUser(conv.userId)?.nickname || '未知用户', messages: conv.messages })
  })

  // ---------- 预警记录 ----------
  mock.onGet(/\/admin\/risk-alerts$/).reply((config) => {
    const { level = '', status = '', page = 1, pageSize = 10 } = config.params || {}
    let list = riskAlerts.map((a) => ({ ...a, nickname: findUser(a.userId)?.nickname || '未知用户' }))
    if (level) list = list.filter((a) => a.level === Number(level))
    if (status) list = list.filter((a) => a.status === status)
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return ok(paginate(list, { page, pageSize }))
  })

  mock.onPut(/\/admin\/risk-alerts\/([^/]+)$/).reply((config) => {
    const id = config.url.match(/\/admin\/risk-alerts\/([^/]+)$/)[1]
    const alert = riskAlerts.find((a) => a.id === id)
    if (!alert) return fail(404, '预警记录不存在')
    const { status, handledBy, remark } = JSON.parse(config.data || '{}')
    const allowed = ALERT_TRANSITIONS[alert.status] || []
    if (!allowed.includes(status)) {
      return fail(400, `不允许从「${ALERT_STATUS[alert.status]?.label || alert.status}」流转到「${ALERT_STATUS[status]?.label || status}」`)
    }
    alert.status = status
    alert.handledBy = handledBy || alert.handledBy
    if (remark !== undefined) alert.remark = remark
    alert.updatedAt = new Date().toLocaleString('sv-SE').replace('T', ' ')
    return ok(alert)
  })

  // ---------- 热线配置 ----------
  mock.onGet(/\/admin\/hotlines$/).reply(() => ok(hotlines))
  mock.onPost(/\/admin\/hotlines$/).reply((config) => {
    const body = JSON.parse(config.data || '{}')
    if (!body.name || !body.phone) return fail(400, '名称与号码必填')
    const row = { id: nextId(hotlines), status: 'active', level: '高危', audience: '全部用户', ...body }
    hotlines.push(row)
    return ok(row)
  })
  mock.onPut(/\/admin\/hotlines\/(\d+)$/).reply((config) => {
    const id = Number(config.url.match(/\/admin\/hotlines\/(\d+)$/)[1])
    const row = hotlines.find((h) => h.id === id)
    if (!row) return fail(404, '热线不存在')
    Object.assign(row, JSON.parse(config.data || '{}'), { id })
    return ok(row)
  })

  // ---------- 心理健康自助资源库 ----------
  mock.onGet(/\/admin\/resources$/).reply((config) => {
    const { type = '', status = '', keyword = '' } = config.params || {}
    let list = [...selfHelp]
    if (type) list = list.filter((r) => r.type === type)
    if (status) list = list.filter((r) => r.status === status)
    if (keyword) list = list.filter((r) => (r.title + r.description).includes(keyword))
    return ok(list)
  })
  mock.onPost(/\/admin\/resources$/).reply((config) => {
    const body = JSON.parse(config.data || '{}')
    if (!body.title) return fail(400, '标题必填')
    const maxNum = selfHelp.reduce((m, x) => Math.max(m, Number(String(x.id).split('_')[1]) || 0), 0)
    const row = {
      id: `sh_${String(maxNum + 1).padStart(2, '0')}`,
      type: '放松音频',
      suitableLevels: [3],
      description: '',
      url: '',
      status: 'active',
      ...body,
      createdAt: new Date().toLocaleString('sv-SE').replace('T', ' ')
    }
    selfHelp.push(row)
    return ok(row)
  })
  mock.onPut(/\/admin\/resources\/([^/]+)$/).reply((config) => {
    const id = config.url.match(/\/admin\/resources\/([^/]+)$/)[1]
    const row = selfHelp.find((r) => r.id === id)
    if (!row) return fail(404, '资源不存在')
    Object.assign(row, JSON.parse(config.data || '{}'), { id })
    return ok(row)
  })
  mock.onDelete(/\/admin\/resources\/([^/]+)$/).reply((config) => {
    const id = config.url.match(/\/admin\/resources\/([^/]+)$/)[1]
    const idx = selfHelp.findIndex((r) => r.id === id)
    if (idx < 0) return fail(404, '资源不存在')
    selfHelp.splice(idx, 1)
    return ok(null)
  })

  // ---------- 数字心理疏导师（内置固定两位，仅支持编辑 Prompt 与启用状态） ----------
  mock.onGet(/\/admin\/digital-humans$/).reply(() => ok(digitalHumans))
  mock.onPut(/\/admin\/digital-humans\/([^/]+)$/).reply((config) => {
    const id = config.url.match(/\/admin\/digital-humans\/([^/]+)$/)[1]
    const row = digitalHumans.find((d) => d.id === id)
    if (!row) return fail(404, '数字人不存在')
    Object.assign(row, JSON.parse(config.data || '{}'), { id })
    return ok(row)
  })

  // ---------- 调试台：用户记忆（小程序端与数字人对话沉淀的长期记忆，按用户聚合） ----------
  mock.onGet(/\/admin\/memories$/).reply((config) => {
    const { keyword = '' } = config.params || {}
    const groups = new Map()
    for (const m of userMemories) {
      const g = groups.get(m.userId) || { userId: m.userId, totalMemories: 0, lastMemoryAt: '' }
      g.totalMemories += 1
      if (m.updatedAt > g.lastMemoryAt) g.lastMemoryAt = m.updatedAt
      groups.set(m.userId, g)
    }
    let list = [...groups.values()].map((g) => {
      const u = findUser(g.userId)
      return { ...g, nickname: u?.nickname || '未知用户', occupation: u?.occupation || '-', digitalHumanName: u?.digitalHumanName || '-' }
    })
    if (keyword) list = list.filter((g) => g.nickname.includes(keyword))
    list.sort((a, b) => (a.lastMemoryAt < b.lastMemoryAt ? 1 : -1))
    return ok(list)
  })

  mock.onGet(/\/admin\/memories\/(\d+)$/).reply((config) => {
    const uid = Number(config.url.match(/\/admin\/memories\/(\d+)$/)[1])
    const user = findUser(uid)
    if (!user) return fail(404, '用户不存在')
    const items = userMemories
      .filter((m) => m.userId === uid)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return ok({ user, items })
  })

  // ---------- 后台账号（仅超管） ----------
  mock.onGet(/\/admin\/accounts$/).reply(() =>
    ok(accounts.map(({ password, ...rest }) => ({ ...rest, roleName: roleNameOf(rest.roleId) })))
  )
  mock.onPost(/\/admin\/accounts$/).reply((config) => {
    const body = JSON.parse(config.data || '{}')
    if (!body.username || !body.password) return fail(400, '用户名与密码必填')
    if (accounts.some((a) => a.username === body.username)) return fail(400, '用户名已存在')
    const now = new Date()
    const row = {
      id: nextId(accounts),
      roleId: 2,
      status: 'active',
      remark: '',
      ...body,
      createdAt: now.toLocaleString('sv-SE').replace('T', ' ')
    }
    accounts.push(row)
    const { password, ...safe } = row
    return ok({ ...safe, roleName: roleNameOf(safe.roleId) })
  })
  mock.onPut(/\/admin\/accounts\/(\d+)$/).reply((config) => {
    const id = Number(config.url.match(/\/admin\/accounts\/(\d+)$/)[1])
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return fail(404, '账号不存在')
    if (acc.roleId === 1) return fail(400, '内置超级管理员账号不可编辑')
    const body = JSON.parse(config.data || '{}')
    if (body.newPassword) acc.password = body.newPassword
    if (body.roleId !== undefined) acc.roleId = body.roleId
    if (body.status !== undefined) acc.status = body.status
    if (body.remark !== undefined) acc.remark = body.remark
    const { password, ...safe } = acc
    return ok({ ...safe, roleName: roleNameOf(safe.roleId) })
  })
  mock.onDelete(/\/admin\/accounts\/(\d+)$/).reply((config) => {
    const id = Number(config.url.match(/\/admin\/accounts\/(\d+)$/)[1])
    const idx = accounts.findIndex((a) => a.id === id)
    if (idx < 0) return fail(404, '账号不存在')
    const acc = accounts[idx]
    if (acc.roleId === 1) return fail(400, '内置超级管理员账号不可删除')
    accounts.splice(idx, 1)
    return ok(null)
  })

  // ---------- 角色权限（仅超管） ----------
  mock.onGet(/\/admin\/roles$/).reply(() => ok(roles))
  mock.onPut(/\/admin\/roles\/(\d+)$/).reply((config) => {
    const id = Number(config.url.match(/\/admin\/roles\/(\d+)$/)[1])
    const role = roles.find((r) => r.id === id)
    if (!role) return fail(404, '角色不存在')
    const { label, description, permissions } = JSON.parse(config.data || '{}')
    if (label !== undefined) role.label = label
    if (description !== undefined) role.description = description
    if (permissions !== undefined) {
      if (role.name === 'superadmin' && !permissions.includes('accounts:manage')) {
        return fail(400, '超级管理员必须保留账号管理权限')
      }
      role.permissions = permissions
    }
    return ok(role)
  })

  // ---------- 调试台：实时风险评测（补充接口，后端需实现） ----------
  mock.onPost(/\/admin\/debug\/risk-eval$/).reply((config) => {
    const body = JSON.parse(config.data || '{}')
    const result = ruleEval(body.text)
    return ok({
      ...result,
      modalityContribution: {
        text: body.inputTypes?.includes('text') || body.text ? 0.72 : 0,
        audio: body.inputTypes?.includes('audio') || body.audioUrl ? 0.55 : 0,
        image: body.inputTypes?.includes('image') || body.imageUrl ? 0.64 : 0
      },
      evaluatedAt: new Date().toLocaleString('sv-SE').replace('T', ' ')
    })
  })

  // ---------- 预设用例 ----------
  mock.onGet(/\/admin\/debug\/preset-cases$/).reply(() => ok({ cases: presetCases }))

  // 兜底：未实现的接口直接报错，避免静默失败
  mock.onAny().reply((config) => {
    ElMessage.error(`[Mock] 未实现的接口：${config.method?.toUpperCase()} ${config.url}`)
    return fail(500, '接口未实现')
  })
}
