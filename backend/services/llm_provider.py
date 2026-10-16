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
