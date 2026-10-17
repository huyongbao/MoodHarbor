"""LLM Provider —— 云端大模型过渡通道（glm-5.3）
按开发计划：AI 调用封装成独立 provider 模块，统一 generate_reply() 签名。
阶段四把 EmoLLM 替换进来时，业务代码一行不动。
"""
import json
import re

import httpx

from config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, RISK_CONFIDENCE_THRESHOLD

# 树洞人设系统提示词（按 PRD 十：共情回应、正常化表达、问题重构、行动建议）
SYSTEM_PROMPT = """你是「情绪树洞」的数字心理疏导师，服务对象是外卖骑手、快递员、网约车司机等新就业形态劳动者。

## 你的沟通原则
1. 不评判、不催促对方振作，先共情再回应
2. 口语化、短句、温和，像朋友聊天，不使用书面腔
3. 回复控制在 3 句话以内，不要说教
4. 绝不给出医疗诊断，不推荐药物

## 风险判断
每次回复时，你要同步评估用户当前的心理风险等级：
- 1 级（红）：明确的自杀意念、计划或遗言
- 2 级（橙）：绝望、崩溃、严重失眠、强烈自我否定
- 3 级（黄）：明显的焦虑、抑郁、愤怒、职业倦怠
- 4 级（蓝）：日常负面情绪，无升级信号

## 输出格式（严格遵守，直接输出 JSON，不要包裹代码块）
{"replyText": "你的共情回复", "riskLevel": 1-4, "confidence": 0.0-1.0, "reason": "风险判断依据"}
"""

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


async def generate_reply(user_text: str, context_summary: str = "") -> dict:
    """统一签名。返回 {replyText, riskLevel, confidence, reason, source}

    - source: 'llm' | 'fallback'，阶段四替换 EmoLLM 时业务代码不动
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context_summary:
        messages.append({"role": "system", "content": "用户近期情绪趋势：" + context_summary})
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
                    "max_tokens": 300,
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            parsed = _extract_json(raw)

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
            }
    except Exception:
        # 模型不可用：规则兜底，绝不漏报（PRD 9.4）
        level, reply, confidence = rule_fallback(user_text)
        return {
            "replyText": reply,
            "riskLevel": level,
            "confidence": confidence,
            "reason": "规则引擎兜底",
            "source": "fallback",
        }


# PRD 8.2 映射表：riskLevel → intervention
def build_intervention(level: int, hotlines: list, self_help: list) -> dict:
    if level == 1:
        return {"type": "emergency", "hotline": hotlines[0] if hotlines else None, "selfHelp": []}
    if level == 2:
        return {"type": "hotline", "hotline": hotlines[0] if hotlines else None, "selfHelp": []}
    if level == 3:
        return {"type": "normal", "hotline": None, "selfHelp": self_help[:2]}
    return {"type": "normal", "hotline": None, "selfHelp": []}


# digitalHumanAction 枚举映射（PRD 8.2）
ACTION_MAP = {1: "emergency", 2: "worry", 3: "comfort", 4: "listen"}


# ================= 多模态矛盾分析（调试台 · 大模型言行一致性判断）=================
CONTRADICTION_PROMPT = """你是「情绪树洞」平台的多模态一致性分析引擎。心理疏导场景中，同一时刻采集到用户的三路模态数据，请判断各模态传递的情绪方向是否矛盾。

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
                    # glm-5.3 为推理模型：思考占用 reasoning_content，max_tokens 过小会导致 content 未生成
                    "max_tokens": 1024,
                },
            )
            resp.raise_for_status()
            # 推理模型异常时 content 字段可能缺失，主动抛错走规则兜底
            raw = resp.json()["choices"][0]["message"].get("content") or ""
            if not raw.strip():
                raise ValueError("模型未输出 content（思考超限）")
            parsed = _extract_json(raw)
            return {
                "contradictory": bool(parsed.get("contradictory")),
                "explanation": (parsed.get("explanation") or "").strip()[:100],
                "source": "llm",
            }
    except Exception:
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
