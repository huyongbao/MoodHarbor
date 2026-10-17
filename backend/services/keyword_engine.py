"""关键词规则引擎 —— 依据赛题文档《新就业心理关键词和援助热线》
与 DeepSeek 大模型判定的主从关系（已评审定稿）：
  - 一级词命中（非歧义）→ 一票否决，强制 1 级，无视模型结论
  - 一级歧义词（"再见了"等日常高频词）单独出现 → 保底 2 级，与模型等级取高
  - 二级词命中 → 保底 2 级（final = min(模型等级, 2)）
  - 三级词不参与强制定级（"累/烦/气死了"太常见，防锚定误报），仅由 prompt 类别提示
  - 四级词不进词库：日常聊天即四级，只做频率统计（P2）
"""
import json
import os

_DIR = os.path.dirname(os.path.abspath(__file__))
KW_PATH = os.path.join(os.path.dirname(_DIR), "config", "risk_keywords.json")

with open(KW_PATH, encoding="utf-8") as f:
    _KW = json.load(f)


def _normalize(text: str) -> str:
    """匹配前归一化：去所有空白（用户语音转写常带空格/标点差异）"""
    return "".join((text or "").split())


def _iter_words(level: str):
    """遍历某级词库，yield (word, category)"""
    for group in _KW["levels"].get(level, []):
        for w in group.get("words", []):
            yield w, group["category"]


# 歧义一级词集合（单独出现保底二级，见模块 docstring）
_AMBIGUOUS_1 = {item["word"] for item in _KW.get("_ambiguous_1", {}).get("words", [])}


def match_keywords(text: str) -> dict:
    """对用户输入做四级词库匹配。

    返回 {
        force_level: 1 或 None        # 非歧义一级词命中 → 一票否决
        floor_level: 1/2/None         # 保底等级（融合时 final = min(final, floor)）
        matched: [(word, category, level, ambiguous), ...]
    }
    """
    norm = _normalize(text)
    matched = []
    strict1 = False
    ambig1 = False
    floor2 = False

    for w, cat in _iter_words("1"):
        if w in norm:
            amb = w in _AMBIGUOUS_1
            matched.append((w, cat, 1, amb))
            if amb:
                ambig1 = True
            else:
                strict1 = True

    # 歧义一级词（存放于 _ambiguous_1 区块，不在 levels.1 里，需单独遍历）
    for item in _KW.get("_ambiguous_1", {}).get("words", []):
        w = item["word"]
        if w in norm:
            matched.append((w, "告别与遗言", 1, True))
            ambig1 = True

    for w, cat in _iter_words("2"):
        if w in norm:
            matched.append((w, cat, 2, False))
            floor2 = True

    if strict1:
        return {"force_level": 1, "floor_level": None, "matched": matched}
    if ambig1:
        # 歧义一级词单独出现：保底二级（模型判 1 则仍 1，判 4 则提到 2）
        return {"force_level": None, "floor_level": 2, "matched": matched}
    if floor2:
        return {"force_level": None, "floor_level": 2, "matched": matched}
    return {"force_level": None, "floor_level": None, "matched": matched}


def matched_summary(matched: list) -> str:
    """留痕摘要：'遗书(告别与遗言,一级); 撑不下去了(绝望感,二级)'"""
    lv_name = {1: "一级", 2: "二级"}
    return "; ".join(f"{w}({cat},{lv_name[lv]}{'·歧义' if amb else ''})" for w, cat, lv, amb in matched)


def build_keywords_context() -> str:
    """生成注入 SYSTEM_PROMPT 的词库上下文（服务启动时构建一次）"""
    lines = []

    lines.append("【一级关键词（极高风险，红色预警）】")
    for group in _KW["levels"]["1"]:
        lines.append(f"- {group['category']}：" + "、".join(group["words"]))
    amb = _KW.get("_ambiguous_1", {}).get("words", [])
    if amb:
        lines.append("- 以下词日常语境也常用（告别/下班），需结合上下文判断是否为告别遗言：" +
                     "、".join(i["word"] for i in amb))

    lines.append("")
    lines.append("【二级关键词（高风险，橙色预警）】")
    for group in _KW["levels"]["2"]:
        lines.append(f"- {group['category']}：" + "、".join(group["words"]))

    lines.append("")
    lines.append("【三级信号（中风险，黄色预警）——按类别理解即可】")
    for group in _KW["levels"]["3"]:
        lines.append(f"- {group['category']}：{group['hint']}")

    lines.append("")
    lines.append("【骑手场景化表达示例（须能识别同类表达）】")
    sc = _KW.get("_rider_scenes", {})
    for lv in ("level1", "level2", "level3"):
        for s in sc.get(lv, []):
            lines.append(f"- 「{s}」")

    return "\n".join(lines)


if __name__ == "__main__":
    # 冒烟自测
    cases = [
        ("我已经写好遗书了，不想活了。", 1),
        ("跟兄弟们再见了，我去下一站。", None),  # 歧义词：保底二级，不强制一级
        ("今天又被客户投诉了，气死我了。", None),
        ("感觉全世界都在跟我作对，我撑不住了。", 2),
        ("今天天气不错啊。", None),
    ]
    for t, expect in cases:
        r = match_keywords(t)
        print(f"{t[:20]!r:<24} force={r['force_level']} floor={r['floor_level']} matched={matched_summary(r['matched'])}")
    print()
    print(build_keywords_context()[:400])
