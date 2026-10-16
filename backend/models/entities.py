"""数据模型 —— 严格按 PRD 8.4（含 V6.2 新增字段：User.updatedAt / Message.imageUrl / RiskAlert.updatedAt）"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey

from database import Base


def now():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    openid = Column(String(64), unique=True, nullable=False, index=True)
    nickname = Column(String(64), default="")           # 契约 3.1
    phone = Column(String(32), default="")              # 契约 3.1（管理端脱敏后返回）
    age = Column(Integer, nullable=True)
    gender = Column(String(16), nullable=True)
    occupation = Column(String(64), nullable=True)
    digital_human_id = Column(String(32), nullable=True)
    status = Column(String(16), default="active")       # active|banned 契约 3.1
    init_status = Column(String(16), default="pending")  # pending / partial / done
    last_active_at = Column(DateTime, nullable=True)     # 契约 3.1
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)  # V6.2

    @property
    def digital_human_selected(self):
        return bool(self.digital_human_id)

    @property
    def profile_completed(self):
        return all([self.age, self.gender, self.occupation])


class DigitalHuman(Base):
    __tablename__ = "digital_humans"

    id = Column(String(32), primary_key=True)
    name = Column(String(32), nullable=False)
    avatar_url = Column(String(255), default="")
    prompt = Column(Text, default="")
    trait = Column(String(32), default="")
    quote = Column(String(128), default="")
    class_name = Column(String(32), default="warm")  # 小程序端配色类名
    status = Column(Integer, default=1)  # 1 上架 / 0 下架


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(32), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String(128), default="新的倾诉")
    created_at = Column(DateTime, default=now)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(32), ForeignKey("conversations.id"), index=True)
    role = Column(String(8), nullable=False)  # user / ai
    content = Column(Text, default="")
    audio_url = Column(String(255), default="")
    image_url = Column(String(255), default="")  # V6.2
    risk_level = Column(Integer, default=4)
    created_at = Column(DateTime, default=now)


class RiskAlert(Base):
    """预警记录 —— 状态机（V6.1）: pending → processing → resolved/false_alarm"""

    __tablename__ = "risk_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    conversation_id = Column(String(32), index=True)
    level = Column(Integer, nullable=False)  # 1 红 / 2 橙
    trigger_words = Column(Text, default="")  # 触发原因（模型 reason）
    status = Column(String(16), default="pending")
    handled_by = Column(String(64), default="")
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)  # V6.2


class Hotline(Base):
    __tablename__ = "hotlines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)
    phone = Column(String(32), nullable=False)
    description = Column(String(128), default="")
    audience = Column(String(32), default="全部用户")   # 契约 3.4 ★新增
    level = Column(String(16), default="高危")           # 契约 3.4 ★改字符串：高危|中危|低危
    status = Column(String(16), default="active")


class SelfHelp(Base):
    __tablename__ = "self_help"

    id = Column(String(16), primary_key=True)
    title = Column(String(64), nullable=False)
    type = Column(String(32), default="放松音频")        # 契约 3.5：放松音频|轻音乐|冥想引导|运动建议|旅行建议|文章
    suitable_levels = Column(String(32), default="[3]")  # 契约 3.5 ★数字数组 JSON，2=中危 3=低危
    duration = Column(String(16), default="")
    description = Column(String(255), default="")        # 契约 3.5
    url = Column(String(255), default="")                 # 契约 3.5
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=now)


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False)
    password = Column(String(255), nullable=False)  # 开发期明文，正式版改哈希
    role_id = Column(Integer, ForeignKey("roles.id"), default=2)
    status = Column(Integer, default=1)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(32), nullable=False)     # superadmin / operator
    label = Column(String(32), default="")          # 契约 3.8：超级管理员 / 运营人员
    description = Column(String(255), default="")
    permissions = Column(Text, default="")           # JSON 数组：dashboard:view 等 13 个
