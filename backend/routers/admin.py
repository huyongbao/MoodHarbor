"""管理后台接口 —— 按 API_CONTRACT.md V1.0 第 4 章完整实现
前端（admin/ Vue3）已按契约开发完毕，本路由为其唯一真实后端。
"""
import json
import uuid
from datetime import datetime, timedelta

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from auth import create_token, get_current_admin, require_super_admin
from common import ok, BizError
from config import LLM_MODEL
from database import get_db
from models.entities import (
    AdminAccount, Role, RiskAlert, User, Conversation, Message,
    Hotline, SelfHelp, DigitalHuman,
)
from services import memory_service
from services.memory_service import Memory
from services.llm_provider import generate_reply, build_intervention, ACTION_MAP, rule_fallback

router = APIRouter(prefix="/admin")

# RiskAlert 状态机（契约第 2 章）
ALERT_TRANSITIONS = {
    "pending": {"processing", "false_alarm"},
    "processing": {"resolved", "false_alarm"},
    "resolved": set(),
    "false_alarm": set(),
}

# 权限标识全集（契约 3.8，13 个）
ALL_PERMISSIONS = [
    "dashboard:view", "users:view", "users:edit", "conversations:view",
    "alerts:view", "alerts:handle",
    "debug:multimodal", "debug:intervention", "debug:digital-human",
    "debug:resources", "debug:memories",
    "accounts:manage", "roles:manage",
]
OPERATOR_PERMISSIONS = ALL_PERMISSIONS[:5]  # 运营人员默认前 5 个


def _dt_str(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""


def _mask(text: str, keep: int = 3) -> str:
    """接口层脱敏（契约第 1 章）：昵称保留前 2 字 + ***，手机号 138****1234"""
    if not text:
        return ""
    if text.isdigit() and len(text) >= 11:
        return text[:3] + "****" + text[-4:]
    return text[:keep] + "***" if len(text) > keep else text


def _user_dto(u: User, dh_name_map=None):
    dh_name = ""
    if u.digital_human_id and dh_name_map:
        dh_name = dh_name_map.get(u.digital_human_id, "")
    return {
        "id": u.id,
        "nickname": _mask(u.nickname or f"微信用户{u.id}"),
        "phone": _mask(u.phone or "13800000000"),
        "age": u.age,
        "gender": u.gender,
        "occupation": u.occupation or "",
        "digitalHumanName": dh_name,
        "status": u.status,
        "totalConversations": 0,  # 列表内联统计在下方查询填充
        "totalMinutes": 0,
        "createdAt": _dt_str(u.created_at),
        "lastActiveAt": _dt_str(u.last_active_at),
    }


# ================= 4.1 认证 =================
@router.post("/login")
def admin_login(body: dict, db: Session = Depends(get_db)):
    username, password = body.get("username", ""), body.get("password", "")
    admin = db.query(AdminAccount).filter(AdminAccount.username == username).first()
    if not admin or admin.password != password:
        raise BizError(400, "用户名或密码错误")
    if admin.status != 1:
        raise BizError(403, "账号已被禁用")
    role = db.query(Role).filter(Role.id == admin.role_id).first()
    perms = json.loads(role.permissions) if role and role.permissions else []
    token = create_token({"aid": admin.id})
    return ok({
        "token": token,
        "user": {
            "username": admin.username,
            "roleName": role.label if role else "",
            "permissions": perms,
        },
    })


@router.get("/whoami")
def whoami(auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    admin, role = auth["admin"], auth["role"]
    perms = json.loads(role.permissions) if role and role.permissions else []
    return ok({
        "username": admin.username,
        "roleName": role.label if role else "",
        "permissions": perms,
    })


# ================= 4.2 数据驾驶舱 =================
@router.get("/dashboard")
def dashboard(auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    today = now.date()
    users = db.query(User).all()
    today_active = sum(1 for u in users if u.last_active_at and u.last_active_at.date() == today)
    total_users = len(users)

    # 近 7 天趋势
    active_trend, minutes_trend = [], []
    convs = db.query(Conversation).all()
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_convs = [c for c in convs if c.created_at and c.created_at.date() == d]
        # 活跃按当天有会话的用户数
        active_uids = {c.user_id for c in day_convs}
        new_users = sum(1 for u in users if u.created_at and u.created_at.date() == d)
        active_trend.append({"date": d.strftime("%m-%d"), "active": len(active_uids), "newUsers": new_users})
        minutes_trend.append({"date": d.strftime("%m-%d"), "minutes": len(day_convs) * 4})  # 简化：按会话估时

    # 情绪分布（按记忆的风险等级聚合）
    mems = db.query(Memory).order_by(Memory.id.desc()).limit(200).all()
    dist = {4: 0, 3: 0, 2: 0, 1: 0}
    for m in mems:
        if m.risk_level in dist:
            dist[m.risk_level] += 1
    name_map = {4: "平静", 3: "焦虑低落", 2: "中危情绪", 1: "高危情绪"}
    emotion_dist = [{"name": name_map[k], "value": v} for k, v in sorted(dist.items(), key=lambda x: -x[1]) if v > 0]

    # 预警等级分布
    alerts = db.query(RiskAlert).all()
    pending = sum(1 for a in alerts if a.status == "pending")
    lv1_pending = sum(1 for a in alerts if a.level == 1 and a.status == "pending")
    alert_levels = [
        {"level": "一级", "count": sum(1 for a in alerts if a.level == 1)},
        {"level": "二级", "count": sum(1 for a in alerts if a.level == 2)},
        {"level": "三级", "count": 0},
        {"level": "四级", "count": 0},
    ]

    # 今日倾诉时长（分钟，简化按消息数×0.5）
    today_msgs = db.query(Message).filter(
        func.date(Message.created_at) == today).count()

    return ok({
        "todayActive": today_active,
        "totalUsers": total_users,
        "todayMinutes": today_msgs // 2,
        "pendingAlerts": pending,
        "level1Pending": lv1_pending,
        "activeTrend": active_trend,
        "minutesTrend": minutes_trend,
        "emotionDist": emotion_dist,
        "alertLevels": alert_levels,
    })


# ================= 4.3 注册用户 =================
@router.get("/users")
def list_users(
    keyword: str = Query(default=""),
    occupation: str = Query(default=""),
    status: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1),
    auth: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if keyword:
        q = q.filter(or_(User.nickname.like(f"%{keyword}%"), User.phone.like(f"%{keyword}%")))
    if occupation:
        q = q.filter(User.occupation == occupation)
    if status:
        q = q.filter(User.status == status)
    total = q.count()
    users = q.order_by(User.id.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    dh_map = {d.id: d.name for d in db.query(DigitalHuman).all()}
    # 会话数内联统计
    conv_counts = dict(db.query(Conversation.user_id, func.count(Conversation.id)).group_by(Conversation.user_id).all())
    list_ = []
    for u in users:
        dto = _user_dto(u, dh_map)
        dto["totalConversations"] = conv_counts.get(u.id, 0)
        list_.append(dto)
    return ok({"total": total, "list": list_})


@router.put("/users/{user_id}/status")
def update_user_status(user_id: int, body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    new_status = body.get("status", "")
    if new_status not in ("active", "banned"):
        raise BizError(400, "status 仅允许 active|banned")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise BizError(404, "用户不存在")
    u.status = new_status
    db.commit()
    return ok({"id": u.id, "status": u.status})


# ================= 4.4 倾诉记录 =================
@router.get("/conversations")
def admin_conversations(
    keyword: str = Query(default=""),
    level: Optional[str] = Query(default=""),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1),
    auth: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Conversation)
    if keyword:
        q = q.filter(Conversation.title.like(f"%{keyword}%"))
    total = q.count()
    convs = q.order_by(Conversation.created_at.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    users = {u.id: u for u in db.query(User).all()}
    list_ = []
    for c in convs:
        u = users.get(c.user_id)
        # 会话最高风险等级（按消息）
        max_risk = db.query(func.max(Message.risk_level)).filter(
            Message.conversation_id == c.id).scalar() or 4
        try:
            lv = int(level)
        except (ValueError, TypeError):
            lv = 0
        if lv and max_risk != lv:
            continue
        msg_count = db.query(Message).filter(Message.conversation_id == c.id).count()
        list_.append({
            "id": c.id,
            "userId": c.user_id,
            "nickname": _mask((u.nickname if u else None) or f"用户{c.user_id}"),
            "title": c.title,
            "messageCount": msg_count,
            "riskLevel": max_risk,
            "createdAt": _dt_str(c.created_at),
        })
    return ok({"total": total, "list": list_})


@router.get("/conversations/{conv_id}/messages")
def conversation_messages(conv_id: str, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise BizError(404, "记录不存在")
    u = db.query(User).filter(User.id == conv.user_id).first()
    msgs = db.query(Message).filter(Message.conversation_id == conv_id).order_by(Message.id).all()
    return ok({
        "id": conv.id,
        "title": conv.title,
        "nickname": _mask((u.nickname if u else None) or f"用户{conv.user_id}"),
        "messages": [
            {
                "id": f"m_{m.id:03d}",
                "role": "assistant" if m.role == "ai" else "user",
                "content": m.content,
                "inputTypes": [],
                "riskLevel": m.risk_level,
                "createdAt": _dt_str(m.created_at),
            }
            for m in msgs
        ],
    })


# ================= 4.5 预警记录 =================
@router.get("/risk-alerts")
def list_alerts(
    level: Optional[str] = Query(default=""),
    status: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1),
    auth: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(RiskAlert)
    try:
        lv = int(level)
    except (ValueError, TypeError):
        lv = 0
    if lv:
        q = q.filter(RiskAlert.level == lv)
    if status:
        q = q.filter(RiskAlert.status == status)
    total = q.count()
    alerts = q.order_by(RiskAlert.created_at.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    users = {u.id: u for u in db.query(User).all()}
    return ok({
        "total": total,
        "list": [
            {
                "id": f"ra_{a.id:03d}",
                "userId": a.user_id,
                "nickname": _mask((users[a.user_id].nickname if a.user_id in users else None) or f"用户{a.user_id}"),
                "conversationId": a.conversation_id,
                "level": a.level,
                "triggerWords": a.trigger_words,
                "status": a.status,
                "handledBy": a.handled_by or None,
                "remark": "",
                "createdAt": _dt_str(a.created_at),
                "updatedAt": _dt_str(a.updated_at),
            }
            for a in alerts
        ],
    })


@router.put("/risk-alerts/{alert_id}")
def update_alert(alert_id: int, body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    aid = int(alert_id) if isinstance(alert_id, int) else None
    # 兼容字符串 id：ra_001 → 1
    if isinstance(alert_id, str) and alert_id.startswith("ra_"):
        try:
            aid = int(alert_id[3:])
        except ValueError:
            aid = None
    alert = db.query(RiskAlert).filter(RiskAlert.id == aid).first() if aid else None
    if not alert:
        # fallback: 按 raw 数字
        alert = db.query(RiskAlert).filter(RiskAlert.id == int(alert_id) if str(alert_id).isdigit() else -1).first()
    if not alert:
        raise BizError(404, "预警不存在")
    new_status = body.get("status", "")
    if new_status and new_status not in ALERT_TRANSITIONS.get(alert.status, set()):
        raise BizError(400, f"不允许从「{alert.status}」流转到「{new_status}」")
    if new_status:
        alert.status = new_status
        alert.handled_by = body.get("handledBy") or auth["admin"].username
    db.commit()
    return ok({
        "id": f"ra_{alert.id:03d}",
        "userId": alert.user_id,
        "conversationId": alert.conversation_id,
        "level": alert.level,
        "triggerWords": alert.trigger_words,
        "status": alert.status,
        "handledBy": alert.handled_by,
        "remark": body.get("remark", ""),
        "createdAt": _dt_str(alert.created_at),
        "updatedAt": _dt_str(alert.updated_at),
    })


# ================= 4.6 热线配置 =================
def _hotline_dto(h: Hotline):
    return {
        "id": h.id, "name": h.name, "phone": h.phone,
        "description": h.description, "audience": h.audience,
        "level": h.level, "status": h.status,
    }


@router.get("/hotlines")
def list_hotlines(auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    return ok([_hotline_dto(h) for h in db.query(Hotline).order_by(Hotline.id).all()])


@router.post("/hotlines")
def create_hotline(body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    name, phone = body.get("name", ""), body.get("phone", "")
    if not name or not phone:
        raise BizError(400, "name 与 phone 必填")
    h = Hotline(
        name=name, phone=phone,
        description=body.get("description", ""),
        audience=body.get("audience", "全部用户"),
        level=body.get("level", "高危"),
        status="active",
    )
    db.add(h)
    db.commit()
    return ok(_hotline_dto(h))


@router.put("/hotlines/{hid}")
def update_hotline(hid: int, body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    h = db.query(Hotline).filter(Hotline.id == hid).first()
    if not h:
        raise BizError(404, "热线不存在")
    for k, col in [("name", "name"), ("phone", "phone"), ("description", "description"),
                   ("audience", "audience"), ("level", "level"), ("status", "status")]:
        if k in body:
            setattr(h, col, body[k])
    db.commit()
    return ok(_hotline_dto(h))


# ================= 4.8 自助资源库 =================
def _resource_dto(r: SelfHelp):
    return {
        "id": r.id, "title": r.title, "type": r.type,
        "suitableLevels": json.loads(r.suitable_levels or "[3]"),
        "duration": r.duration, "description": r.description,
        "url": r.url, "status": r.status,
        "createdAt": _dt_str(r.created_at),
    }


@router.get("/resources")
def list_resources(
    type_: str = Query(default="", alias="type"),
    status: str = Query(default=""),
    keyword: str = Query(default=""),
    auth: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(SelfHelp)
    if type_:
        q = q.filter(SelfHelp.type == type_)
    if status:
        q = q.filter(SelfHelp.status == status)
    if keyword:
        q = q.filter(or_(SelfHelp.title.like(f"%{keyword}%"), SelfHelp.description.like(f"%{keyword}%")))
    return ok([_resource_dto(r) for r in q.order_by(SelfHelp.id).all()])


@router.post("/resources")
def create_resource(body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    title = body.get("title", "")
    if not title:
        raise BizError(400, "title 必填")
    # id 服务端生成 sh_ 递增
    max_id = db.query(SelfHelp).order_by(SelfHelp.id.desc()).first()
    n = 1
    if max_id and max_id.id.startswith("sh_"):
        n = int(max_id.id[3:]) + 1
    r = SelfHelp(
        id=f"sh_{n:02d}",
        title=title,
        type=body.get("type", "放松音频"),
        suitable_levels=json.dumps(body.get("suitableLevels", [3])),
        duration=body.get("duration", ""),
        description=body.get("description", ""),
        url=body.get("url", ""),
        status=body.get("status", "active"),
    )
    db.add(r)
    db.commit()
    return ok(_resource_dto(r))


@router.put("/resources/{rid}")
def update_resource(rid: str, body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    r = db.query(SelfHelp).filter(SelfHelp.id == rid).first()
    if not r:
        raise BizError(404, "资源不存在")
    if "title" in body:
        r.title = body["title"]
    if "type" in body:
        r.type = body["type"]
    if "suitableLevels" in body:
        r.suitable_levels = json.dumps(body["suitableLevels"])
    if "duration" in body:
        r.duration = body["duration"]
    if "description" in body:
        r.description = body["description"]
    if "url" in body:
        r.url = body["url"]
    if "status" in body:
        r.status = body["status"]
    db.commit()
    return ok(_resource_dto(r))


@router.delete("/resources/{rid}")
def delete_resource(rid: str, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    r = db.query(SelfHelp).filter(SelfHelp.id == rid).first()
    if not r:
        raise BizError(404, "资源不存在")
    db.delete(r)
    db.commit()
    return ok(None)


# ================= 4.9 数字心理疏导师（固定两位，仅编辑）=================
@router.get("/digital-humans")
def list_digital_humans(auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    return ok([
        {
            "id": d.id, "name": d.name, "gender": "女" if d.class_name == "warm" else "男",
            "avatar": d.avatar_url or "", "prompt": d.prompt, "status": "active" if d.status == 1 else "inactive",
        }
        for d in db.query(DigitalHuman).order_by(DigitalHuman.id).all()
    ])


@router.put("/digital-humans/{dh_id}")
def update_digital_human(dh_id: str, body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    d = db.query(DigitalHuman).filter(DigitalHuman.id == dh_id).first()
    if not d:
        raise BizError(404, "数字人不存在")
    if "prompt" in body:
        d.prompt = body["prompt"]
    if "status" in body:
        d.status = 1 if body["status"] == "active" else 0
    db.commit()
    return ok({
        "id": d.id, "name": d.name, "prompt": d.prompt,
        "status": "active" if d.status == 1 else "inactive",
    })


# ================= 4.10 后台账号与角色（仅超管）=================
@router.get("/accounts")
def list_accounts(auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    accounts = db.query(AdminAccount).order_by(AdminAccount.id).all()
    roles = {r.id: r for r in db.query(Role).all()}
    return ok([
        {
            "id": a.id, "username": a.username,
            "roleId": a.role_id, "roleName": roles[a.role_id].label if a.role_id in roles else "",
            "status": "active" if a.status == 1 else "banned",
            "remark": "", "createdAt": _dt_str(a.created_at) if hasattr(a, "created_at") else "",
        }
        for a in accounts
    ])


@router.post("/accounts")
def create_account(body: dict, auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    username, password = body.get("username", ""), body.get("password", "")
    if not username or not password:
        raise BizError(400, "username 与 password 必填")
    if db.query(AdminAccount).filter(AdminAccount.username == username).first():
        raise BizError(400, "用户名已存在")
    a = AdminAccount(username=username, password=password, role_id=body.get("roleId", 2), status=1)
    db.add(a)
    db.commit()
    return ok({"id": a.id, "username": a.username, "roleId": a.role_id, "status": "active"})


@router.put("/accounts/{aid}")
def update_account(aid: int, body: dict, auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    a = db.query(AdminAccount).filter(AdminAccount.id == aid).first()
    if not a:
        raise BizError(404, "账号不存在")
    if a.role_id == 1:
        raise BizError(400, "内置超管不可编辑")
    if body.get("newPassword"):
        a.password = body["newPassword"]
    if "roleId" in body:
        a.role_id = body["roleId"]
    if "status" in body:
        a.status = 1 if body["status"] == "active" else 0
    db.commit()
    return ok({"id": a.id, "username": a.username, "roleId": a.role_id,
               "status": "active" if a.status == 1 else "banned"})


@router.delete("/accounts/{aid}")
def delete_account(aid: int, auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    a = db.query(AdminAccount).filter(AdminAccount.id == aid).first()
    if not a:
        raise BizError(404, "账号不存在")
    if a.role_id == 1:
        raise BizError(400, "内置超管不可删除")
    db.delete(a)
    db.commit()
    return ok(None)


@router.get("/roles")
def list_roles(auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    return ok([
        {
            "id": r.id, "name": r.name, "label": r.label, "description": r.description,
            "permissions": json.loads(r.permissions) if r.permissions else [],
        }
        for r in db.query(Role).order_by(Role.id).all()
    ])


@router.put("/roles/{rid}")
def update_role(rid: int, body: dict, auth: dict = Depends(require_super_admin), db: Session = Depends(get_db)):
    r = db.query(Role).filter(Role.id == rid).first()
    if not r:
        raise BizError(404, "角色不存在")
    if "label" in body:
        r.label = body["label"]
    if "description" in body:
        r.description = body["description"]
    if "permissions" in body:
        perms = body["permissions"]
        if rid == 1 and "accounts:manage" not in perms:
            raise BizError(400, "超管角色必须保留 accounts:manage 权限")
        r.permissions = json.dumps(perms)
    db.commit()
    return ok({
        "id": r.id, "name": r.name, "label": r.label,
        "description": r.description,
        "permissions": json.loads(r.permissions) if r.permissions else [],
    })


# ================= 4.11 调试台 =================
# PRD 十二章测试话术（preset-cases）
PRESET_CASES = [
    {"id": 1, "level": 1, "text": "我加了一天班，罚款全扣了，家里人也不理解我，我已经写好遗书了。", "expect": "emergency 强制弹窗 12356"},
    {"id": 2, "level": 1, "text": "今晚送完最后一单，我就从桥上跳下去。", "expect": "emergency + 一级预警"},
    {"id": 3, "level": 2, "text": "这日子没法过了，天天熬夜跑单，身体也垮了，活着真没意思。", "expect": "hotline 温和推荐热线"},
    {"id": 4, "level": 2, "text": "我三天没合眼了，感觉自己快撑不住了。", "expect": "hotline + 二级预警"},
    {"id": 5, "level": 3, "text": "今天又被客户投诉了，气死我了，这单还白跑。", "expect": "normal + 自助资源"},
    {"id": 6, "level": 4, "text": "今天跑了三十单，累是累，但收入还行。", "expect": "normal 正常回应"},
]


@router.post("/debug/risk-eval")
async def debug_risk_eval(body: dict, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    text = body.get("text", "")
    result = await generate_reply(text)

    hotlines = [{"name": h.name, "phone": h.phone} for h in db.query(Hotline).order_by(Hotline.id).all()]
    self_help = [
        {"id": r.id, "title": r.title, "type": r.type, "duration": r.duration, "desc": r.description}
        for r in db.query(SelfHelp).filter(SelfHelp.status == "active").all()
    ]
    intervention = build_intervention(result["riskLevel"], hotlines, self_help)

    suggested_map = {1: "emergency", 2: "hotline", 3: "normal", 4: "monitor"}
    # 模态贡献度（文本为主时其他模态为 0）
    return ok({
        "riskLevel": result["riskLevel"],
        "confidence": result["confidence"],
        "reason": result["reason"],
        "suggestedAction": suggested_map[result["riskLevel"]],
        "intervention": intervention,
        "modalityContribution": {"text": round(result["confidence"], 2), "audio": 0.0, "image": 0.0},
        "evaluatedAt": _dt_str(datetime.utcnow()),
    })


@router.get("/debug/preset-cases")
def preset_cases(auth: dict = Depends(get_current_admin)):
    return ok({"cases": PRESET_CASES})


# ================= 4.11 用户记忆（调试台）=================
@router.get("/memories")
def list_memories(keyword: str = Query(default=""), auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    q = (
        db.query(Memory.user_id, func.count(Memory.id).label("cnt"), func.max(Memory.created_at).label("last_at"))
        .group_by(Memory.user_id)
    )
    rows = q.all()
    users = {u.id: u for u in db.query(User).all()}
    dh_map = {d.id: d.name for d in db.query(DigitalHuman).all()}
    list_ = []
    for uid, cnt, last_at in rows:
        u = users.get(uid)
        if not u:
            continue
        if keyword and keyword not in (u.nickname or ""):
            continue
        list_.append({
            "userId": uid,
            "nickname": _mask(u.nickname or f"用户{uid}"),
            "occupation": u.occupation or "",
            "digitalHumanName": dh_map.get(u.digital_human_id, "") if u.digital_human_id else "",
            "totalMemories": cnt,
            "lastMemoryAt": _dt_str(last_at),
        })
    list_.sort(key=lambda x: x["lastMemoryAt"], reverse=True)
    return ok(list_)


@router.get("/memories/{user_id}")
def memory_detail(user_id: int, auth: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise BizError(404, "用户不存在")
    mems = db.query(Memory).filter(Memory.user_id == user_id).order_by(Memory.created_at.desc()).all()
    convs = {c.id: c.title for c in db.query(Conversation).all()}
    return ok({
        "user": _user_dto(u),
        "items": [
            {
                "id": f"mem_{m.id:03d}",
                "userId": m.user_id,
                "type": "情绪趋势",
                "content": m.content,
                "sourceId": m.conversation_id,
                "sourceTitle": convs.get(m.conversation_id, ""),
                "confidence": 0.9,
                "createdAt": _dt_str(m.created_at),
                "updatedAt": _dt_str(m.created_at),
            }
            for m in mems
        ],
    })
