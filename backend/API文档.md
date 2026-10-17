# 情绪树洞 · 后端接口文档（阶段二骨架）

> 按 PRD V6.3 §8.1/8.2/8.3 实现，Apifox 导入可直接使用
> BaseURL：`http://127.0.0.1:8000/api/v1`（正式部署换 HTTPS 域名）
> 启动：`uvicorn main:app --port 8000`（backend/ 目录下）
> 鉴权：JWT，请求头 `Authorization: Bearer <token>`；统一响应 `{code, message, data}`，code 与 HTTP 状态码一一对应

## 一、小程序端接口（PRD 8.2）

| 模块 | 接口 | 方法 | 说明 | 鉴权 |
| :--- | :--- | :--- | :--- | :--- |
| 登录 | `/auth/wechat-login` | POST | body `{code}`；开发期 `WX_LOGIN_MOCK=true` 免微信校验；返回 token | ✕ |
| 初始化 | `/user/init-status` | GET | 返回 `{digitalHumanSelected, profileCompleted}`（PRD 5.3）| ✓ |
| 初始化 | `/digital-humans` | GET | 数字人列表（3 位：小愈/阿沐/小晴）| ✕ |
| 初始化 | `/user/digital-human` | POST | body `{digitalHumanId}` | ✓ |
| 用户 | `/user/profile` | GET/PUT | PUT 幂等（V6.2），body `{age, gender, occupation}` | ✓ |
| 文件 | `/upload` | POST | multipart `file`，返回 `{fileUrl}`（两步流程第一步）| ✓ |
| 会话 | `/conversations` | POST | 创建会话，返回 `{conversationId}` | ✓ |
| 对话 | `/chat/completions` | POST | body 见下方 | ✓ |
| 记录 | `/conversations` | GET | 当前用户会话列表 | ✓ |
| 记录 | `/conversations/{id}` | GET | 对话消息详情 | ✓ |
| 记录 | `/conversations/{id}` | DELETE | 单删；`/conversations/all` 一键清除（TODO 阶段四：同步删 Mem0 记忆）| ✓ |
| 资源 | `/hotlines` | GET | 12356 / 宁师傅 / 12355（PRD 十章）| ✕ |
| 资源 | `/self-help` | GET | 4 条自助放松资源 | ✕ |
| 预警 | `/risk-alerts` | POST | body `{level, conversationId}`（后端对话时也会自动生成）| ✓ |

### 对话接口（核心）

请求：
```json
POST /chat/completions
{
  "conversationId": "c_xxx",
  "inputTypes": ["text"],
  "text": "今天又被客户投诉了，气死我了",
  "audioUrl": "",
  "imageUrl": "",
  "digitalHumanId": "dh_01"
}
```

响应（PRD 8.2 映射表）：
```json
{
  "code": 0,
  "data": {
    "replyText": "共情回复……",
    "digitalHumanAction": "comfort",
    "riskLevel": 3,
    "intervention": {
      "type": "normal | hotline | emergency",
      "hotline": {"id": "hl_01", "name": "全国统一心理援助热线", "phone": "12356"},
      "selfHelp": [{"id": "sh_01", "title": "3 分钟呼吸放松"}]
    }
  }
}
```

**分级表现**（已按 PRD 十二章样例全量回归通过）：
| riskLevel | intervention.type | selfHelp | 前端表现 |
| :--- | :--- | :--- | :--- |
| 1（红） | `emergency` | — | 强制弹窗（小程序端 5s 倒计时不可立即关闭）+ 自动生成一级预警 |
| 2（橙） | `hotline` | — | 温和弹窗 + 自动生成二级预警 |
| 3（黄） | `normal` | 必返回 2 条 | 底部自助资源推荐卡 |
| 4（蓝） | `normal` | — | 正常回应 |

**AI 通道**：当前为云端 LLM 过渡（`LLM_MODEL=deepseek-flash`，DeepSeek 官方 API），置信度 < 0.8 时与规则兜底加权取高等级；LLM 不可用时纯规则兜底（绝不漏报）。阶段四替换 EmoLLM 仅改 `services/llm_provider.py`。

## 二、管理后台接口（PRD 8.3 最小实现）

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/admin/login` | POST | body `{username, password}`；种子账号：admin/admin123（超管）、operator/operator123（运营）|
| `/admin/dashboard` | GET | 用户数/会话数/消息数/一二级预警/待跟进数 |
| `/admin/risk-alerts` | GET | 预警列表 |
| `/admin/risk-alerts/{id}` | PUT | 状态流转（V6.1 状态机校验：pending→processing→resolved/false_alarm，非法流转返回 400）|
| `/admin/users` | GET | 用户列表（脱敏：openid 不出库）|
| `/admin/conversations` | GET | 会话列表（脱敏用户名）|

## 三、实测验收记录（2026-10-16）

对照 PRD 十二章测试话术样例集，全量回归通过：

| 样例 | 预期 | 实测 | 结果 |
| :--- | :--- | :--- | :--- |
| "今天跑了三十单，累是累，但收入还行" | 4 级 normal | riskLevel=4, action=listen | ✅ |
| "今天又被客户投诉了，气死我了" | 3 级 normal+selfHelp | riskLevel=3, action=comfort, 资源卡 2 条 | ✅ |
| "天天熬夜跑单，活着真没意思" | 2 级 hotline | riskLevel=2, 12356 热线卡, 自动预警 | ✅ |
| "我已经写好遗书了" | 1 级 emergency | riskLevel=1, emergency 强制干预, 自动预警 | ✅ |
| 预警状态流转 | pending→processing ✓ / processing→pending 拒 400 | 全通过 | ✅ |

## 四、小程序联调切换

`miniprogram/utils/config.js`：`USE_MOCK` 改为 `false`，`BASE_URL` 保持 `http://127.0.0.1:8000/api/v1`，开发者工具勾选「不校验合法域名」。

## 五、已知边界（阶段四完善）

- 语音/表情模态：`inputTypes` 含 audio/image 时暂按文本通道处理（FunASR + emotion2vec+ / Py-Feat 阶段四接入）
- Mem0 记忆层未接入，趋势提升规则待阶段四生效
- 微信 code2Session：`WX_LOGIN_MOCK=false` 需配 `WX_APPID`/`WX_SECRET`
- 管理端调试台、RBAC 账号管理接口待小伙伴开发 Vue3 前端时补充
