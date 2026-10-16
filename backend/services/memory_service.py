"""记忆服务层 —— PRD 9.2 步骤 3：上下文记忆
当前实现：SQLAlchemy 存储（黑客松阶段零依赖，SQLite 单文件）
架构约定：provider 统一签名，阶段四后续可无缝替换为 Mem0 + Chroma 向量库，
          业务代码（routers 层）一行不动。
覆盖能力：
  - add()        对话后写入记忆（情绪快照）
  - get_trend()  检索近 N 条 → 情绪趋势摘要（拼 Prompt 用）
  - is_worsening() 判断"近期情绪持续恶化"（PRD 趋势提升规则的数据依据）
  - clear_user() 一键清除（V6.1：范围含向量库记忆）
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Session

from database import Base
from datetime import datetime


class Memory(Base):
    """用户情绪记忆（Mem0 替换前的关系型实现）
    一条记忆 = 一次对话的快照：内容摘要 + 风险等级 + 情绪标签
    """
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    conversation_id = Column(String(32), index=True)
    content = Column(Text, default="")          # 用户输入摘要
    emotion = Column(String(32), default="")    # 情绪标签（由 LLM reason 提取或风险等级映射）
    risk_level = Column(Integer, default=4)
    created_at = Column(DateTime, default=datetime.utcnow)


# 情绪标签映射（供 Prompt 趋势摘要使用）
EMOTION_LABELS = {
    1: "危机",
    2: "崩溃绝望",
    3: "愤怒焦虑",
    4: "平稳",
}


def add(db: Session, user_id: int, conversation_id: str, content: str, risk_level: int, emotion: str = ""):
    """对话后写入记忆"""
    db.add(Memory(
        user_id=user_id,
        conversation_id=conversation_id,
        content=(content or "")[:120],  # 记忆只存摘要，不存全文（隐私最小化）
        emotion=emotion or EMOTION_LABELS.get(risk_level, ""),
        risk_level=risk_level,
    ))
    db.commit()


def get_recent(db: Session, user_id: int, n: int = 10):
    """检索近 N 条记忆（默认 10 条，即 Mem0 的"近 N 条对话"语义）"""
    return (
        db.query(Memory)
        .filter(Memory.user_id == user_id)
        .order_by(Memory.created_at.desc(), Memory.id.desc())
        .limit(n)
        .all()
    )


def get_trend(db: Session, user_id: int, n: int = 10) -> str:
    """情绪趋势摘要：拼进 Prompt（PRD 9.2 步骤 3：形成"情绪趋势摘要"）"""
    items = get_recent(db, user_id, n)
    if not items:
        return ""
    items = list(reversed(items))  # 时间正序
    parts = [f"【{i+1}】{m.content}（情绪：{m.emotion or EMOTION_LABELS.get(m.risk_level, '未知')}，风险{m.risk_level}级）"
             for i, m in enumerate(items)]
    return "; ".join(parts)


def is_worsening(db: Session, user_id: int, window: int = 3, threshold: int = 3) -> bool:
    """PRD 9.2 趋势提升：近 window 条记忆风险等级全部 ≤ threshold（即持续三级或更差）
    → 最新一次对话自动提升一级（riskLevel 数值减 1）

    校准样例（PRD 十二章）：连续多次对话每次均三级 → 最新一次提升为二级处理
    """
    items = get_recent(db, user_id, window)
    if len(items) < window:
        return False
    return all(m.risk_level <= threshold for m in items)


def clear_user(db: Session, user_id: int):
    """一键清除该用户全部记忆（V6.1：清除范围含向量库记忆）"""
    deleted = db.query(Memory).filter(Memory.user_id == user_id).delete()
    db.commit()
    return deleted
