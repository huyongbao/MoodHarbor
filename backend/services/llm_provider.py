"""LLM Provider —— DeepSeek 官方 API 通道（默认 deepseek-flash / V4.1-Flash）
按开发计划：AI 调用封装成独立 provider 模块，统一 generate_reply() 签名。
阶段四把 EmoLLM 替换进来时，业务代码一行不动。
切换模型只改 .env 的 LLM_MODEL（deepseek-flash / deepseek-v4-pro）。
"""
import json
import logging
import re

import httpx

from config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, RISK_CONFIDENCE_THRESHOLD
from services.keyword_engine import build_keywords_context, match_keywords

logger = logging.getLogger("llm_provider")

# 词库上下文：服务进程内静态（词库随代码分发，改动需重启）
_KEYWORDS_BLOCK = build_keywords_context()

# 系统提示词模板 —— 双模式（日常聊天 / 风险疏导）+ 词库上下文 + 语义等价判断
_SYSTEM_TEMPLATE = """你是「歇会儿」的数字心理疏导师，服务对象是外卖骑手、快递员、网约车司机等新就业形态劳动者。
{persona_block}
## 双模式回复
- 日常聊天（无风险信号）：像朋友一样自然聊天，可以提问、接话、给生活化建议，不必句句共情开场，不说教
- 风险语境（命中下方词库、或你判断表达存在风险）：切换为疏导模式——先共情承接情绪，不追问细节、不评判、不说教

## 沟通原则
1. 口语化、短句、温和，像朋友聊天，不使用书面腔
2. 绝不给出医疗诊断，不推荐药物
3. 风险语境下回复控制在 3 句以内；日常聊天不超过 5 句

## 风险等级
- 1 级（红）：明确的自杀意念、计划或遗言；或与下方一级词表语义相同的表达
- 2 级（橙）：绝望、崩溃、严重失眠、强烈自我否定
- 3 级（黄）：明显的焦虑、抑郁、愤怒、职业倦怠
- 4 级（蓝）：日常负面情绪或普通闲聊，无升级信号

{keywords_block}

## 判断要求（每轮必须执行）
1. 逐条对照一级词表：用户表达是否命中，或语义相同——包括谐音、拼音、拆字、比喻、场景化隐喻（如"送完这单就永远不干了""撑到月底就退出"这类告别式表述）
2. 词表中标注"日常语境常用"的词（再见了 / 解脱了等），若为普通告别或下班感慨，不算风险
3. matchedKeyword：命中的词或语义对应的词，无则填 null
4. semanticEquivalent：表达与一级词表语义相同（含变形）则为 true，否则 false

## 输出格式（最高优先级，任何情况下必须遵守）
你的全部输出必须是**一个 JSON 对象**，不要输出任何 JSON 之外的文字、不要加代码块标记。
你要对用户说的话（包括日常聊天）一律放在 replyText 字段里。
{{"replyText": "你的回复", "riskLevel": 1-4, "confidence": 0.0-1.0, "reason": "风险判断依据", "matchedKeyword": null, "semanticEquivalent": false}}
"""


def build_system_prompt(persona: str = "") -> str:
    """组装系统提示词。persona 为所选数字人的人设（DigitalHuman.prompt），可为空"""
    persona_block = f"\n## 你的人设\n{persona}\n" if persona else ""
    return _SYSTEM_TEMPLATE.format(persona_block=persona_block, keywords_block=_KEYWORDS_BLOCK)


# 向后兼容：模块级默认 prompt（persona 为空时的完整版本）
SYSTEM_PROMPT = build_system_prompt()

# 规则兜底（PRD 9.4：仅当模型不可用或置信度极低时启用的降级安全网）
FALLBACK_RULES = [
    (1, ["遗书", "跳下去", "自杀", "不想活", "轻生", "从桥上"]),
    (2, ["没意思", "撑不住", "熬不下去", "崩溃", "绝望", "没合眼", "没法过"]),
    (3, ["气死", "投诉", "罚款", "委屈", "白跑", "误解", "累"]),
]
FALLBACK_REPLIES = {
    1: "我听到了你此刻的痛。你先深呼吸，我在这里陪着你。这条热线那头是专业人员，现在就拨打 12356 好吗？",
    2: "听起来这段时间把你压得很沉。先别急着振作，允许自己撑不住，我们一起慢慢来。如果愿意，12356 那头有专业的人随时接住你。",
    3: "被这样对待真的会很难受，换谁都会委屈。你已经辛苦一整天了，先松口气，我们做个小小的呼吸练习好吗？",
    4: "辛苦了，忙了一天还记得来说说话，这很好。慢慢说，我在听。",
}


def rule_fallback(text: str):
    """规则引擎兜底：返回 (level, reply, confidence)"""
    for level, words in FALLBACK_RULES:
        if any(w in (text or "") for w in words):
            return level, FALLBACK_REPLIES[level], 0.5
    return 4, FALLBACK_REPLIES[4], 0.9


def _extract_json(raw: str) -> dict:
    """从模型输出中提取 JSON（容忍代码块包裹）"""
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        raise ValueError("模型输出中未找到 JSON")
    return json.loads(match.group(0))


async def summarize_session(transcript: str, persona: str = "") -> str:
    """倾诉结束小结：把本次对话浓缩成 2~3 句第三人称温和回顾（写入长期记忆）"""
    messages = [
        {"role": "system", "content": (
            "你是数字心理疏导师。用户刚结束一段倾诉，请把本次对话浓缩成 2~3 句"
            "第三人称的温和小结：聊到了什么、情绪状态如何、有什么值得肯定的变化。"
            "口语化、不诊断、不说教，总长不超过 80 字，直接输出小结正文，"
            "不要任何前缀、引号或多余格式。"
            + (f"\n人设参考：{persona}" if persona else "")
        )},
        {"role": "user", "content": (transcript or "（本次倾诉没有留下文字内容）")[-2000:]},
    ]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                LLM_BASE_URL.rstrip("/") + "/chat/completions",
                headers={"Authorization": "Bearer " + LLM_API_KEY},
                json={"model": LLM_MODEL, "messages": messages,
                      "temperature": 0.5, "max_tokens": 300},
            )
            resp.raise_for_status()
            txt = (resp.json()["choices"][0]["message"].get("content") or "").strip()
            return txt[:200] or "（本次倾诉暂无小结）"
    except Exception as e:
        logger.warning("倾诉小结生成失败: %s", e)
        return ""


async def generate_reply(
    user_text: str,
    context_summary: str = "",
    history: list = None,
    persona: str = "",
) -> dict:
    """统一签名。返回 {replyText, riskLevel, confidence, reason, source,
                       matchedKeyword, semanticEquivalent}

    - history: 本会话最近几轮 [(role, content), ...]，时间正序（多轮上下文）
    - persona: 数字人人设（DigitalHuman.prompt），空则用通用人设
    - source: 'llm' | 'fallback'，阶段四替换 EmoLLM 时业务代码不动
    """
    messages = [{"role": "system", "content": build_system_prompt(persona)}]
    if context_summary:
        messages.append({"role": "system", "content": "用户近期情绪趋势：" + context_summary})
    for role, content in (history or [])[-6:]:
        if content:
            messages.append({"role": role if role in ("user", "assistant") else "user",
                             "content": content})
    messages.append({"role": "user", "content": user_text or "[语音/表情输入]"})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                LLM_BASE_URL.rstrip("/") + "/chat/completions",
                headers={"Authorization": "Bearer " + LLM_API_KEY},
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    # deepseek-flash 是推理模型：思考 token 占 100~200 且随机波动，
                    # 给 300 会偶发被截断（finish_reason=length → JSON 不完整 → 误落规则兜底），
                    # 1024 只作上限、按实际用量计费，不影响成本
                    "max_tokens": 1024,
                },
            )
            resp.raise_for_status()
            choice = resp.json()["choices"][0]
            raw = choice["message"].get("content") or ""
            if choice.get("finish_reason") == "length":
                logger.warning("LLM 输出被 max_tokens 截断，将走规则兜底（考虑调大 max_tokens）")
            try:
                parsed = _extract_json(raw)
            except Exception:
                # 容错：闲聊模式下模型偶发输出纯文本回复（内容往往是对的）——
                # 直接接管为 replyText，等级用关键词引擎 + 规则兜底；非纯文本（空/截断）才真正放弃
                txt = (raw or "").strip()
                if txt and "{" not in txt and len(txt) <= 400:
                    kw0 = match_keywords(user_text)
                    fb_level, _, _ = rule_fallback(user_text)
                    level0 = kw0["force_level"] or kw0["floor_level"] or fb_level
                    parsed = {"replyText": txt, "riskLevel": level0, "confidence": 0.5,
                              "reason": "模型输出纯文本，已容错接管",
                              "matchedKeyword": None, "semanticEquivalent": False}
                    logger.warning("模型输出纯文本（未含 JSON），已容错为 replyText（L%s）", level0)
                else:
                    logger.warning("JSON 解析失败 raw[:240]=%r finish=%s", raw[:240], choice.get("finish_reason"))
                    raise

            level = int(parsed.get("riskLevel", 4))
            confidence = float(parsed.get("confidence", 0))
            # 置信度低于阈值 → 与规则兜底加权取高等级（数值更小者，PRD 9.2）
            if confidence < RISK_CONFIDENCE_THRESHOLD:
                fb_level, fb_reply, _ = rule_fallback(user_text)
                if fb_level < level:
                    level = fb_level
                    parsed["replyText"] = parsed.get("replyText") or fb_reply
            if not parsed.get("replyText"):
                raise ValueError("replyText 为空")

            return {
                "replyText": parsed["replyText"],
                "riskLevel": level,
                "confidence": confidence,
                "reason": parsed.get("reason", ""),
                "source": "llm",
                "matchedKeyword": parsed.get("matchedKeyword") or None,
                "semanticEquivalent": bool(parsed.get("semanticEquivalent")),
            }
    except Exception as e:
        # 模型不可用：规则兜底，绝不漏报（PRD 9.4）
        # 必须留日志，否则欠费/超时/JSON 截断会静默降级成模板话术而无人察觉
        logger.warning("LLM 调用失败，走规则兜底：%s: %s", type(e).__name__, e)
        level, reply, confidence = rule_fallback(user_text)
        return {
            "replyText": reply,
            "riskLevel": level,
            "confidence": confidence,
            "reason": "规则引擎兜底",
            "source": "fallback",
            "matchedKeyword": None,
            "semanticEquivalent": False,
        }


# PRD 8.2 映射表：riskLevel → intervention
# 处置热线按《新就业心理关键词和援助热线》分等级选择：
#   一级：12356（24h 全国）为主，宁师傅为备，并提示 110 / 120
#   二级：宁师傅（温和引入），12356 备选
#   三级：不强转介，推自助资源
def _find_hotline(hotlines: list, keyword: str):
    """按号码/名称关键字选热线；找不到退回第一条"""
    for h in hotlines:
        if keyword in (h.get("phone") or "") or keyword in (h.get("name") or ""):
            return h
    return hotlines[0] if hotlines else None


def build_intervention(level: int, hotlines: list, self_help: list) -> dict:
    if level == 1:
        return {
            "type": "emergency",
            "hotline": _find_hotline(hotlines, "12356"),
            "backupHotline": _find_hotline(hotlines, "96889910"),
            "emergencyContacts": ["110", "120"],
            "selfHelp": [],
        }
    if level == 2:
        return {
            "type": "hotline",
            "hotline": _find_hotline(hotlines, "96889910") or _find_hotline(hotlines, "12356"),
            "backupHotline": None,
            "selfHelp": [],
        }
    if level == 3:
        return {"type": "normal", "hotline": None, "selfHelp": self_help[:2]}
    return {"type": "normal", "hotline": None, "selfHelp": []}


# digitalHumanAction 枚举映射（PRD 8.2）
ACTION_MAP = {1: "emergency", 2: "worry", 3: "comfort", 4: "listen"}


# ================= 每轮记忆抽取（异步，不阻塞对话） =================
_EXTRACT_PROMPT = """你是记忆抽取器。判断下面这轮对话里，有没有值得长期记住的用户个人信息或重要事件。

只提取这些类别：家人健康状况、重要家庭事件、工作重大变动、重要决定、重大情绪事件（如亲人离世）。
不要提取：日常跑单吐槽、天气、吃饭、一时情绪、普通疲惫。

输出 JSON（不要代码块）：
{"memorable": true或false, "content": "≤40字的事实摘要（第三人称）", "importance": "high或mid"}

示例：
- 用户说"我妈住院了" → {"memorable": true, "content": "母亲住院治疗", "importance": "high"}
- 用户说"今天跑了三十单" → {"memorable": false, "content": "", "importance": "low"}
"""


async def extract_memorable(user_text: str, ai_text: str) -> dict:
    """抽取本轮值得记住的事实。返回 {memorable, content, importance}；失败返回 memorable=False"""
    fallback = {"memorable": False, "content": "", "importance": "low"}
    messages = [
        {"role": "system", "content": _EXTRACT_PROMPT},
        {"role": "user", "content": f"用户：{user_text or '[语音]'}\n数字人：{ai_text or ''}"},
    ]
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                LLM_BASE_URL.rstrip("/") + "/chat/completions",
                headers={"Authorization": "Bearer " + LLM_API_KEY},
                json={"model": LLM_MODEL, "messages": messages, "temperature": 0.2, "max_tokens": 400},
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"].get("content") or ""
            parsed = _extract_json(raw)
            if not parsed.get("memorable"):
                return fallback
            content = (parsed.get("content") or "").strip()
            if not content:
                return fallback
            return {
                "memorable": True,
                "content": content[:60],
                "importance": parsed.get("importance") if parsed.get("importance") in ("high", "mid") else "mid",
            }
    except Exception as e:
        logger.warning("记忆抽取失败（不影响主对话）：%s: %s", type(e).__name__, e)
        return fallback


# ================= 多模态矛盾分析（调试台 · 大模型言行一致性判断）=================
CONTRADICTION_PROMPT = """你是「歇会儿」平台的多模态一致性分析引擎。心理疏导场景中，同一时刻采集到用户的三路模态数据，请判断各模态传递的情绪方向是否矛盾。

## 典型矛盾样例
- 嘴上说"我很好/没事"，但面部表情悲伤或语音低落压抑 → 矛盾（压抑掩饰真实痛苦）
- 声泪俱下地诉苦，但表情平静甚至微笑 → 矛盾（强颜欢笑）
- 各模态情绪方向一致（无论好坏）→ 不矛盾

## 输出格式（严格遵守，直接输出 JSON，不要包裹代码块）
{"contradictory": true或false, "explanation": "不超过50字的中文解释，指出哪些模态之间矛盾"}"""

# 模态标签 → 中文（规则兜底与 LLM 输入共用）
MODALITY_LABELS = {"happy": "开心", "calm": "平静", "sad": "悲伤", "fear": "恐惧", "angry": "愤怒"}


async def analyze_contradiction(text: str, text_risk_level: int, facial: dict, voice: dict) -> dict:
    """三模态矛盾分析：LLM 判断言行是否一致。返回 {contradictory, explanation, source}

    - source: 'llm' | 'rule'（模型不可用时规则引擎兜底，绝不静默失败）
    """
    user_content = "\n".join([
        "- 说话内容：" + (text or "[无有效语音]"),
        f"- 文本情感：{text_risk_level} 级（1 最严重 ~ 4 正常）",
        f"- 面部表情：{MODALITY_LABELS.get(facial.get('emotion'), facial.get('emotion'))}（置信度 {facial.get('confidence')}）",
        f"- 语音情感：{MODALITY_LABELS.get(voice.get('emotion'), voice.get('emotion'))}（置信度 {voice.get('confidence')}）",
        "请输出 JSON。",
    ])
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                LLM_BASE_URL.rstrip("/") + "/chat/completions",
                headers={"Authorization": "Bearer " + LLM_API_KEY},
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": CONTRADICTION_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    "temperature": 0.2,
                    # 矛盾分析要输出 JSON，留足 token；部分推理模型会把预算耗在思考上导致 content 为空
                    "max_tokens": 1024,
                },
            )
            resp.raise_for_status()
            # content 可能缺失（推理模型思考超限 / 异常返回），主动抛错走规则兜底
            raw = resp.json()["choices"][0]["message"].get("content") or ""
            if not raw.strip():
                raise ValueError("模型未输出 content（思考超限）")
            parsed = _extract_json(raw)
            return {
                "contradictory": bool(parsed.get("contradictory")),
                "explanation": (parsed.get("explanation") or "").strip()[:100],
                "source": "llm",
            }
    except Exception as e:
        logger.warning("矛盾分析 LLM 失败，走规则兜底：%s: %s", type(e).__name__, e)
        return _rule_contradiction(text, text_risk_level, facial, voice)


def _rule_contradiction(text: str, text_risk_level: int, facial: dict, voice: dict) -> dict:
    """规则兜底：低风险文本 × 高痛苦表情/语音（或反向）→ 矛盾，防止 LLM 不可用时提醒缺失"""
    DISTRESS, THRESH = ("sad", "fear", "angry"), 0.7
    label = lambda m: MODALITY_LABELS.get(m.get("emotion"), str(m.get("emotion")))
    distress = [m for m in (facial, voice) if m and m.get("emotion") in DISTRESS and m.get("confidence", 0) >= THRESH]
    if distress:
        if text_risk_level >= 3:
            ch = "、".join(("面部表情" if m is facial else "语音情感") + "为「" + label(m) + "」" for m in distress)
            return {"contradictory": True,
                    "explanation": f"说「{(text or '')[:16]}」情绪平稳，但{ch}，言行不一致",
                    "source": "rule"}
        return {"contradictory": False, "explanation": "文本与表情/语音情绪方向一致，均为负面", "source": "rule"}
    if text_risk_level <= 2:
        return {"contradictory": True,
                "explanation": "倾诉内容显示高风险痛苦，但表情与语音平静，可能存在掩饰",
                "source": "rule"}
    return {"contradictory": False, "explanation": "三模态情绪方向一致，未检出矛盾", "source": "rule"}
