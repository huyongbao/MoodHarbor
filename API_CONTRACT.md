# 情绪树洞 · 接口契约（管理后台 ↔ 小程序后端）

> 版本：V1.0 ｜ 更新日期：2026-10-16 ｜ 维护：管理后台组（赵）
> 接收人：小程序后端同学

## 0. 这份文档解决什么问题

本项目的**后端只有一套**（由小程序组实现），需要同时服务两个前端：

| 前端 | 调用接口 | 现状 |
|---|---|---|
| 管理后台（`admin/`，Vue3） | `/admin/*`（本文第 4 章） | **已完成**，当前全部走本地 mock，后端就绪后一键切换 |
| 小程序（`miniprogram/`） | `/mp/*`（本文第 5 章为建议契约） | 由小程序组自行开发 |

因此**代码不会冲突**，需要的是契约对齐。本文档包含四部分：

1. **全局约定**（第 1 章）——响应壳、认证、分页、错误码
2. **等级体系**（第 2 章）——★ 本周刚改过，最优先对齐
3. **共享数据模型**（第 3 章）——建表字段以此为准
4. **管理端接口清单**（第 4 章）——后端**必须**实现，管理后台前端已按此开发完毕
5. **C 端接口建议**（第 5 章）——小程序前端需要、且要消费管理后台配置的数据

---

## 1. 全局约定

| 项 | 约定 |
|---|---|
| Base URL | `/api/v1`（管理后台通过 `VITE_API_BASE` 配置，可改） |
| 统一响应壳 | `{ code, message, data }`；`code=0` 成功，非 0 失败 |
| HTTP 与 code 成对 | 成功 `200/0`；参数或业务校验失败 `400/400`；未登录 `401/401`；无权限 `403/403`；资源不存在 `404/404` |
| 认证 | `Authorization: Bearer <token>`；仅 `POST /admin/login` 与 C 端登录接口免认证 |
| 分页 | 请求 `?page=1&pageSize=10`；响应 `data: { total, list }` |
| 时间格式 | `YYYY-MM-DD HH:mm:ss` 字符串（如 `2026-10-16 17:36:20`） |
| 前缀与账号体系 | `/admin/*` = 后台账号（JWT）；C 端建议 `/mp/*` = 微信用户（独立 JWT）。**两套 token 不互通** |
| 脱敏 | 管理端用户列表的昵称/手机号在**接口层**脱敏后返回（`138****1234`），后台不做二次处理 |

---

## 2. 等级体系（★ 本周变更，最优先对齐）

系统里有两套表述，**数值体系是底座，文案体系是其映射**：

| riskLevel（数字） | 预警文案 | 用户侧叫法 | 干预动作 |
|---|---|---|---|
| 1 | 一级（红） | **高危** | `emergency` 紧急转介热线 |
| 2 | 二级（橙） | **中危** | `hotline` 热线推荐 + 内置矛盾分析建议 |
| 3 | 三级（黄） | **低危** | `normal` + 自助资源推送 |
| 4 | 四级（蓝） | 正常 | `monitor` 仅监测 |

**各字段用哪套：**

| 字段 | 取值 | 说明 |
|---|---|---|
| `conversations.riskLevel`、`messages.riskLevel` | 数字 1-4 | 会话/消息风险等级 |
| `riskAlerts.level` | 数字 1-4 | 预警等级（1、2 才产生预警） |
| `hotlines.level` | **字符串** `'高危' \| '中危' \| '低危'` | 热线适用等级（本周新增字段） |
| `selfHelp.suitableLevels` | **数字数组**，如 `[2,3]` | 资源适用等级，取 riskLevel 值：2=中危、3=低危 |
| 矛盾分析建议 | 键 `level2` / `level3` | 文案与关联资源由后端内置（见 3.6），管理端不再配置 |

**预警状态机**（`riskAlerts.status`，非法流转返回 400）：

```
pending（待跟进） ──→ processing（跟进中） ──→ resolved（已解决）
      │                     │
      └──→ false_alarm（误报）←┘        resolved / false_alarm 为终态
```

---

## 3. 共享数据模型（建表以此为准）

### 3.1 User（C 端用户）

```json
{
  "id": 10003,                      // 数字主键，C 端生成
  "nickname": "微信用户3121",        // 管理端返回时已脱敏
  "phone": "138****1234",           // 管理端返回时已脱敏
  "age": 23,
  "gender": "男",
  "occupation": "外卖骑手",          // 外卖骑手|快递员|网约车司机|其他新就业形态
  "digitalHumanName": "小满",       // 用户绑定的数字人（固定两位：小满/知远）
  "status": "active",               // active|banned（管理端封禁）
  "totalConversations": 7,
  "totalMinutes": 42,
  "createdAt": "2026-09-03 09:12:00",
  "lastActiveAt": "2026-10-12 10:30:00"
}
```

### 3.2 Conversation / Message（倾诉会话）

```json
// Conversation
{
  "id": "c_005",                    // 字符串主键，c_ + 3位序号
  "userId": 10005,
  "title": "矛盾提升案例",           // 首条消息摘要
  "riskLevel": 3,                   // 会话最高风险等级 1-4
  "createdAt": "2026-10-16 12:30:00",
  "messages": [ /* Message[]，仅明细接口返回 */ ]
}

// Message
{
  "id": "m_041",
  "role": "user",                   // user|assistant
  "content": "没事，就是累了",
  "inputTypes": ["text", "image"],  // 输入模态：text|audio|image（assistant 固定 []）
  "riskLevel": 3,                   // 该条消息评测等级（assistant 消息沿用上文）
  "createdAt": "2026-10-16 12:30:20"
}
```

### 3.3 RiskAlert（预警记录）

```json
{
  "id": "ra_001",                   // 字符串主键 ra_ + 3位序号
  "userId": 10007,
  "conversationId": "c_002",
  "level": 1,                       // 1-4，仅 1/2 产生预警
  "triggerWords": "已写好遗书",      // 命中的风险表达
  "status": "pending",              // pending|processing|resolved|false_alarm（状态机见第 2 章）
  "handledBy": null,                // 处理人后台用户名
  "remark": "",
  "createdAt": "2026-10-15 23:18:25",
  "updatedAt": "2026-10-15 23:18:25"
}
```

### 3.4 Hotline（心理援助热线）★ 本周新增 audience、level 改三级

```json
{
  "id": 3,
  "name": "南京市妇联热线",
  "phone": "12338",
  "description": "妇女心理与权益支持",
  "audience": "妇女",               // ★适用人群：全部用户|妇女|青少年|职工群体（自由文本）
  "level": "高危",                  // ★适用等级：'高危'|'中危'|'低危'（现有 5 条均为高危）
  "status": "active"                // active|inactive
}
```

### 3.5 SelfHelpResource（心理健康自助资源库）★ 本周新增模块

```json
{
  "id": "sh_01",                    // 字符串主键 sh_ + 2位序号
  "title": "三分钟呼吸放松",
  "type": "放松音频",               // 放松音频|轻音乐|冥想引导|运动建议|旅行建议|文章
  "suitableLevels": [2, 3],         // ★适用等级（数字数组，2=中危 3=低危）
  "description": "跟随引导完成一次腹式呼吸练习，快速平复紧绷情绪",
  "url": "https://cdn.moodharbor.cn/audio/breathing-3min.mp3",  // 可为空
  "status": "active",               // active|inactive
  "createdAt": "2026-09-20 10:00:00"
}
```

### 3.6 矛盾分析建议（后端内置）★ 管理端配置已移除

矛盾分析干预建议（用户口头表述与表情/语音矛盾、等级提升时推送）由后端内置，**无管理端配置链路**（GET/PUT /admin/intervention 已下线）：

```json
{
  "level2": {                       // 中危：文本低风险但表情/语音呈高痛苦时推送
    "advice": "我注意到你说\"没事\"，但你的声音和表情都在告诉我，你其实撑得很辛苦。先别急着回到单子里，接杯热水走动两分钟，或者听一段放松音频缓一缓，好吗？",
    "resourceIds": ["sh_01"]        // 关联自助资源 id
  },
  "level3": {                       // 低危
    "advice": "嘴上说没事，表情可诚实啦。忙完这单抽空出去走走，哪怕楼下转一圈；晚上也可以听听轻音乐，让自己松下来。",
    "resourceIds": ["sh_02", "sh_04", "sh_05"]
  }
}
```

### 3.7 DigitalHuman（数字心理疏导师）★ 内置固定两位

内置固定两位（一男一女），不可新增/删除，仅可编辑 `prompt` 与 `status`。`avatarColor` 已废弃，改为 `avatar` 图片地址 + `gender`：

```json
{
  "id": "dh_01",
  "name": "小满",                        // 女；dh_02 为「知远」（男）
  "gender": "女",
  "avatar": "/img/avatars/xiaoman.png",  // 人物形象图片地址
  "prompt": "你是\"小满\"……遵循四级干预策略……",  // system prompt，C 端对话时引用
  "status": "active"                // active|inactive
}
```

### 3.8 后台账号 / 角色（RBAC）

```json
// AdminAccount（password 仅登录校验用，列表接口永不返回）
{ "id": 1, "username": "superadmin", "roleId": 1, "status": "active", "remark": "内置超管账号", "createdAt": "2026-09-01 09:00:00" }

// Role
{ "id": 1, "name": "superadmin", "label": "超级管理员", "description": "拥有全部功能权限", "permissions": ["dashboard:view", "..."] }
```

**权限标识全集**（13 个，运营人员默认仅前 5 个）：

```
dashboard:view  users:view  users:edit  conversations:view
alerts:view  alerts:handle
debug:multimodal  debug:intervention  debug:digital-human  debug:resources  debug:memories
accounts:manage  roles:manage
```

---

### 3.9 UserMemory（用户长期记忆）★ 本周新增（调试台「用户记忆」）

小程序端用户与数字人对话结束后由记忆系统（计划 Mem0 + Chroma 向量库）沉淀；对话开始时检索「情绪趋势摘要」拼入 Prompt。管理端仅**按用户聚合展示**，内容为**脱敏后的摘要**；用户在小程序端一键清除后须同步删除对应记忆。

```json
// UserMemory（sourceId 为产生该记忆的会话；跨会话聚合类记忆为 null）
{ "id": "mem_001", "userId": 10003, "type": "情绪趋势",
  "content": "近两周因平台罚款与差评反复出现委屈、挫败情绪",
  "sourceId": "c_001", "sourceTitle": "被罚款了，一天白干",
  "confidence": 0.91, "createdAt": "2026-10-16 08:45:00", "updatedAt": "2026-10-16 08:45:00" }
```

| 字段 | 说明 |
| --- | --- |
| `type` | `情绪趋势` / `关键事件` / `偏好` / `关注话题` |
| `content` | 脱敏后的记忆摘要（不含手机号、真实姓名等隐私原文） |
| `confidence` | 记忆抽取置信度 0-1，管理端按百分比展示 |

---

## 4. 管理端接口（后端必须实现，`/admin/*`）

> 管理后台前端已按本节开发完毕并全量 mock 联调。响应均指 `data` 字段内容。

### 4.1 认证

**POST /admin/login**

```json
// 请求
{ "username": "superadmin", "password": "admin123" }
// 响应
{
  "token": "jwt...",
  "user": { "username": "superadmin", "roleName": "超级管理员", "permissions": ["dashboard:view", "..."] }
}
// 校验：账号不存在或密码错 → 400「用户名或密码错误」；status=banned → 403「账号已被禁用」
```

**GET /admin/whoami** → `{ username, roleName, permissions }`（校验 token 并下发最新权限，供旧会话启动时静默同步；无效/禁用 → 401）

### 4.2 数据驾驶舱

**GET /admin/dashboard**

```json
{
  "todayActive": 12, "totalUsers": 26, "todayMinutes": 87,
  "pendingAlerts": 4, "level1Pending": 1,
  "activeTrend":  [ { "date": "10-10", "active": 8, "newUsers": 2 }, "…7 天" ],
  "minutesTrend": [ { "date": "10-10", "minutes": 64 }, "…7 天" ],
  "emotionDist":  [ { "name": "平静", "value": 30 }, { "name": "焦虑", "value": 27 }, "…" ],
  "alertLevels":  [ { "level": "一级", "count": 2 }, { "level": "二级", "count": 6 }, { "level": "三级", "count": 0 }, { "level": "四级", "count": 0 } ]
}
```

### 4.3 注册用户

**GET /admin/users** `?keyword=&occupation=&status=&page=&pageSize=`
→ `{ total, list: [User（脱敏）] }`（keyword 匹配昵称+手机号）

**PUT /admin/users/:id/status** `{ "status": "banned" }`（仅 `active|banned`，非法值 400）→ `{ id, status }`

### 4.4 倾诉记录

**GET /admin/conversations** `?keyword=&level=&page=&pageSize=`
→ `{ total, list: [{ id, userId, nickname, title, messageCount, riskLevel, createdAt }] }`（按创建时间倒序）

**GET /admin/conversations/:id/messages**
→ `{ id, title, nickname, messages: [Message] }`

### 4.5 预警记录

**GET /admin/risk-alerts** `?level=&status=&page=&pageSize=`
→ `{ total, list: [RiskAlert + nickname] }`（按创建时间倒序）

**PUT /admin/risk-alerts/:id** `{ "status": "processing", "handledBy": "superadmin", "remark": "已外呼" }`
→ 完整 RiskAlert
- 校验状态机（第 2 章），非法流转 → 400「不允许从「待跟进」流转到「已解决」」

### 4.6 热线配置

**GET /admin/hotlines** → `[Hotline]`（全量，不分页）

> 内置种子热线 8 条（南京专业心理援助资源），分两组：核心危机干预热线 4 条——全国 12356（全部用户，南京接入）、南京市总工会"宁师傅"（职工）、市妇联 12338（妇女）、江苏·南京 12355（青少年）；补充支持渠道 4 条——南京脑科医院失眠门诊/心理门诊（全部用户，中危）、"宁工享"微信公众号心理模块（职工）、宁小蜂驿站心理健康活动（新就业形态劳动者）、江苏省大学生 24 小时心理热线 025-58255200（大学生，中危）。

**POST /admin/hotlines** `{ name, phone, description?, audience?, level? }` → Hotline
- 校验：name、phone 必填否则 400
- 默认值：`status='active'`、`level='高危'`、`audience='全部用户'`

**PUT /admin/hotlines/:id** `{ 任意字段 }` → Hotline

### 4.7 干预配置 ★ 已下线

矛盾分析建议改为后端内置（见 3.6），**GET/PUT /admin/intervention 接口已删除，无需实现**。

### 4.8 心理健康自助资源库 ★ 新增

**GET /admin/resources** `?type=&status=&keyword=` → `[SelfHelpResource]`（全量，不分页；keyword 匹配标题+说明）

**POST /admin/resources** `{ title, type?, suitableLevels?, description?, url?, status? }` → SelfHelpResource
- 校验：title 必填否则 400
- 默认值：`type='放松音频'`、`suitableLevels=[3]`、`status='active'`；id 服务端生成（`sh_` 递增）

**PUT /admin/resources/:id** `{ 任意字段 }` → SelfHelpResource

**DELETE /admin/resources/:id** → `null`

### 4.9 数字心理疏导师 ★ 固定两位

数字人内置固定两位（小满/知远，见 3.7），**POST 已删除，不可新增/删除**。

**GET /admin/digital-humans** → `[DigitalHuman]`

**PUT /admin/digital-humans/:id** `{ prompt?, status? }` → DigitalHuman

### 4.10 后台账号与角色（仅超管）

| 接口 | 说明 |
|---|---|
| GET /admin/accounts | 列表，**永不返回 password**，附 `roleName` |
| POST /admin/accounts | `{ username, password, roleId? }`；用户名重复 400；默认 `roleId=2` |
| PUT /admin/accounts/:id | `{ newPassword?, roleId?, status?, remark? }`；**内置超管（roleId=1）不可编辑 → 400** |
| DELETE /admin/accounts/:id | **内置超管（roleId=1）不可删除 → 400** |
| GET /admin/roles | `[Role]` |
| PUT /admin/roles/:id | `{ label?, description?, permissions? }`；超管必须保留 `accounts:manage` → 否则 400 |

### 4.11 调试台

**POST /admin/debug/risk-eval** `{ "text": "...", "inputTypes?": ["text"], "audioUrl?": "", "imageUrl?": "" }`

```json
{
  "riskLevel": 2, "confidence": 0.86,
  "reason": "识别到绝望/躯体耗竭表述，建议热线支持并持续监测",
  "suggestedAction": "hotline",            // emergency|hotline|normal|monitor
  "intervention": {
    "type": "hotline",                     // emergency|hotline|normal
    "hotline": { "name": "全国统一心理援助热线", "phone": "12356" },  // 或 null
    "selfHelp": [ /* SelfHelpResource[]，低危时推送 */ ]
  },
  "modalityContribution": { "text": 0.72, "audio": 0.55, "image": 0.64 },
  "evaluatedAt": "2026-10-16 12:00:00"
}
```

**GET /admin/debug/preset-cases** → `{ cases: [{ id, level, text, expect }] }`

**GET /admin/memories** ★ 用户记忆聚合列表（调试台「用户记忆」，`debug:memories`）`?keyword=`

→ `[{ userId, nickname, occupation, digitalHumanName, totalMemories, lastMemoryAt }]`，按 `lastMemoryAt` 倒序（仅返回产生了记忆的用户）

**GET /admin/memories/:userId** ★ 用户记忆明细

→ `{ user: User, items: UserMemory[] }`，`items` 按 `createdAt` 倒序；用户不存在 `404/404`。内容由记忆系统（3.9）脱敏后落库，本接口原样返回

### 4.12 WebSocket：多模态实时推流（调试台用）

**端点**：`ws(s)://<host>/api/v1/admin/ws/debug/multimodal?token=<JWT>`

**服务端 → 管理后台**，5 类 JSON 消息：

```jsonc
// ① 会话开始
{ "type": "session_start", "sessionId": "s_xxx", "userId": 10005, "startedAt": 1697000000000 }

// ② 模态数据更新（时间片 200~800ms，各路模态可选携带）
{ "type": "modality_update", "sessionId", "timestamp",
  "video":       { "frame": "data:image/jpeg;base64,..." },
  "facial":      { "emotion": "sad|calm|happy|fear|angry", "confidence": 0.88 },   // Py-Feat
  "voice":       { "emotion": "sad|calm|happy|fear|angry", "confidence": 0.81 },   // emotion2vec+
  "asr":         { "text": "没事，就是累了。", "isFinal": true },                   // FunASR
  "textEmotion": { "riskLevel": 4, "confidence": 0.62 }                            // EmoLLM，null=不可用
}

// ③ 矛盾分析结果（每句 isFinal 后推送一轮）
{ "type": "contradiction_analysis", "sessionId", "timestamp",
  "input": { "text": null, "facial": null, "voice": null, "asrText": "..." },
  "steps": [ { "key": "model|confidence|rule_fallback|contradiction|trend", "name", "triggered", "detail" } ],
  "final": { "riskLevel": 3, "consistent": false, "confidence": 0.74 } }

// ④ 数字人回应
{ "type": "assistant_reply", "sessionId", "timestamp", "text": "..." }

// ⑤ 会话结束
{ "type": "session_end", "sessionId", "endedAt", "summary": { "rounds", "contradictionHits", "trendHits", "maxLevel" } }
```

**判定链（后端必须按此实现，与调试页展示逻辑一一对应）**：

1. **模型初始判定**：EmoLLM 文本情感（可能不可用）
2. **置信度融合**：置信度 ≥0.8 直接采信；<0.8 与规则兜底加权，取**更高**风险等级
3. **规则兜底**：模型不可用或低置信且命中极高危词 → 强制升级（防漏报）
4. **矛盾提升**：文本 ≥3 级 + 表情/语音高痛苦（sad/fear/angry 且置信度 ≥0.7）→ riskLevel **-1**（升一级）
5. **趋势提升**：Mem0 连续三轮同等级且 ≤3 → riskLevel **-1**（升一级）

---

## 5. C 端接口建议（`/mp/*`，小程序前端所需）

以下为建议契约，小程序组可调整命名，但**返回的数据必须来自第 4 章管理端维护的同一批表**。

| 接口 | 说明 |
|---|---|
| POST /mp/login | 微信 code2session 换 token + 用户注册/回访 |
| GET /mp/digital-humans | 数字人列表（**仅 `status=active`**），用户选定后用于对话 prompt |
| POST /mp/conversations / GET /mp/conversations/:id/messages | 会话与消息读写，`riskLevel`、`inputTypes` 按第 3.2 节落库 |
| POST /mp/evaluate | 多模态风险评测：后端跑第 4.12 节判定链，返回 `{ riskLevel, confidence, intervention }` |
| GET /mp/hotlines?level= | 热线下发：按 `level`（高危/中危/低危）与 `audience` 过滤，仅 active |
| GET /mp/resources?level= | ★ 自助资源下发：`suitableLevels` 包含该等级且 `status=active` 的资源（中危=2、低危=3） |
| GET /mp/contradiction-advice | ★ 矛盾分析建议下发：按最终 riskLevel 返回内置的 `{ advice, resourceIds }`（见 3.6），小程序端用 resourceIds 换资源详情或由后端直接内联 resources |

> ★ 两条是本周「矛盾分析」功能的核心链路：**建议文案与关联资源由后端内置（3.6）→ 小程序端按最终 riskLevel 取用**。高危（level 1）仍走热线转介，不消费这两条。

---

## 6. 数据读写边界

| 数据 | 写入方 | 读取方 |
|---|---|---|
| users | C 端（注册/活跃）+ 管理端（封禁） | 两端 |
| conversations / messages | 仅 C 端产生 | 管理端查看（脱敏） |
| riskAlerts | 仅后端按评测结果自动产生 | 管理端处理（状态机流转） |
| hotlines / selfHelp / digitalHumans | **仅管理端配置** | C 端消费（第 5 章）；矛盾分析建议由后端内置（3.6） |
| accounts / roles | 仅管理端超管 | 仅管理端 |

---

## 7. 联调切换与对齐 Checklist

管理后台切换真实后端：`admin/.env.development` 中 `VITE_USE_MOCK=false` + `VITE_API_BASE=http://<后端地址>/api/v1`，前端代码零改动。

**后端实现后请逐项确认：**

- [ ] 统一响应壳 `{code, message, data}`，code=0 成功；HTTP 状态码与业务 code 成对
- [ ] 等级体系对齐第 2 章（riskLevel 数字 1-4；热线 level 用 高危/中危/低危 字符串）
- [ ] 热线表含 `audience` 字段；资源表含 `suitableLevels` 字段
- [ ] 矛盾分析建议内置实现（见 3.6 的 level2/level3 文案与 resourceIds）
- [ ] 预警状态机校验（非法流转 400）
- [ ] 管理端用户接口返回脱敏昵称/手机号
- [ ] 用户记忆（3.9 / 4.11）：记忆内容脱敏落库；小程序端清除后同步删除对应用户记忆
- [ ] 账号列表/资源列表等接口不泄漏 password
- [ ] WS 推流 5 类消息结构与第 4.12 节一致
- [ ] C 端接口（第 5 章）能读到管理端配置的热线/资源与内置矛盾建议
