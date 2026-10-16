"""小程序端接口 —— PRD 8.2 全部 17 个接口"""
import json
import logging
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session

from auth import create_token, get_current_user
from common import ok, BizError
from config import UPLOAD_DIR, WX_LOGIN_MOCK, WX_APPID, WX_SECRET
from database import get_db
from models.entities import (
    User, DigitalHuman, Conversation, Message, RiskAlert, Hotline, SelfHelp,
)
from services.llm_provider import generate_reply, build_intervention, ACTION_MAP
from services import memory_service
from services import audio_service, face_service

logger = logging.getLogger("miniprogram")

router = APIRouter()


# ---------- 登录：POST /auth/wechat-login ----------
class LoginBody:
    def __init__(self, code: str = ""):
        self.code = code


@router.post("/auth/wechat-login")
async def wechat_login(body: dict, db: Session = Depends(get_db)):
    code = body.get("code", "")
    # 开发阶段：code2Session 需要正式域名与密钥，Mock 模式用 code 直接当 openid
    # 正式联调：WX_LOGIN_MOCK=false 时走微信 jscode2session
    if WX_LOGIN_MOCK:
        openid = "wx_" + (code or uuid.uuid4().hex[:12])
    else:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={"appid": WX_APPID, "secret": WX_SECRET, "js_code": code, "grant_type": "authorization_code"},
            )
            data = resp.json()
            openid = data.get("openid")
            if not openid:
                raise BizError(400, "微信登录失败：" + str(data.get("errmsg", "")))

    user = db.query(User).filter(User.openid == openid).first()
    if not user:
        user = User(openid=openid, init_status="pending")
        db.add(user)
        db.commit()
    token = create_token({"uid": user.id})
    return ok({"token": token, "userId": user.id})


# ---------- 初始化状态：GET /user/init-status（PRD 5.3）----------
@router.get("/user/init-status")
def init_status(user: User = Depends(get_current_user)):
    return ok({
        "digitalHumanSelected": user.digital_human_selected,
        "profileCompleted": user.profile_completed,
    })


# ---------- 数字人列表：GET /digital-humans ----------
@router.get("/digital-humans")
def digital_humans(db: Session = Depends(get_db)):
    list_ = db.query(DigitalHuman).filter(DigitalHuman.status == 1).all()
    return ok([
        {
            "id": d.id, "name": d.name, "trait": d.trait, "quote": d.quote,
            "avatarUrl": d.avatar_url, "prompt": d.prompt, "className": d.class_name,
        }
        for d in list_
    ])


# ---------- 保存数字人：POST /user/digital-human ----------
@router.post("/user/digital-human")
def save_digital_human(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    dh_id = body.get("digitalHumanId")
    if not db.query(DigitalHuman).filter(DigitalHuman.id == dh_id).first():
        raise BizError(400, "数字人不存在")
    user.digital_human_id = dh_id
    if user.init_status != "done":
        user.init_status = "partial" if not user.profile_completed else "done"
    db.commit()
    return ok({"digitalHumanId": dh_id})


# ---------- 用户资料：GET /user/profile ----------
@router.get("/user/profile")
def get_profile(user: User = Depends(get_current_user)):
    return ok({"age": user.age, "gender": user.gender, "occupation": user.occupation})


# ---------- 用户资料：PUT /user/profile（V6.2 幂等）----------
@router.put("/user/profile")
def put_profile(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if "age" in body:
        user.age = int(body["age"]) if body["age"] else None
    if "gender" in body:
        user.gender = body["gender"]
    if "occupation" in body:
        user.occupation = body["occupation"]
    if user.digital_human_selected and user.profile_completed:
        user.init_status = "done"
    db.commit()
    return ok({"age": user.age, "gender": user.gender, "occupation": user.occupation})


# ---------- 文件上传：POST /upload（V6.1 两步流程第一步）----------
@router.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    if ext.lower() not in (".mp3", ".wav", ".m4a", ".aac", ".jpg", ".jpeg", ".png", ".webp", ".bin"):
        raise BizError(400, "不支持的文件类型")
    name = f"u{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(await file.read())
    return ok({"fileUrl": f"/uploads/{name}"})


# ---------- 创建会话：POST /conversations ----------
@router.post("/conversations")
def create_conversation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = Conversation(id="c_" + uuid.uuid4().hex[:10], user_id=user.id)
    db.add(conv)
    db.commit()
    return ok({"conversationId": conv.id})


# ---------- 对话：POST /chat/completions（V6.2 inputTypes 组合输入）----------
@router.post("/chat/completions")
async def chat_completions(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv_id = body.get("conversationId", "")
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise BizError(404, "会话不存在")

    input_types = body.get("inputTypes", ["text"])
    text = body.get("text", "")
    audio_url = body.get("audioUrl", "")
    image_url = body.get("imageUrl", "")

    # 0. 多模态特征提取（PRD 9.2 步骤 2：本地 FunASR + emotion2vec+ / Py-Feat）
    audio_emotion = None   # {labels, distress_score}
    face_emotion = None
    if "audio" in input_types and audio_url:
        try:
            audio_path = os.path.join(UPLOAD_DIR, audio_url.replace("/uploads/", ""))
            if os.path.exists(audio_path):
                asr_out = audio_service.transcribe(audio_path)
                if not text:  # ASR 转写填充 text（V6.2：含 audio 时由后端自动填充）
                    text = asr_out["text"]
                audio_emotion = audio_service.analyze_emotion(audio_path)
        except Exception as e:
            logger.warning(f"语音处理失败: {e}")
    if "image" in input_types and image_url:
        try:
            image_path = os.path.join(UPLOAD_DIR, image_url.replace("/uploads/", ""))
            if os.path.exists(image_path):
                face_emotion = face_service.analyze_face(image_path)
        except Exception as e:
            logger.warning(f"表情处理失败: {e}")

    # 1. 对话前：检索近 N 条记忆 → 情绪趋势摘要（PRD 9.2 步骤 3）
    trend_summary = memory_service.get_trend(db, user.id, n=10)
    # 多模态特征附加进 Prompt 上下文（模型可感知语音/表情情绪）
    modality_ctx = []
    if audio_emotion and audio_emotion["labels"]:
        modality_ctx.append("语音情绪：" + "、".join(f"{l}({s})" for l, s in audio_emotion["labels"]))
    if face_emotion and face_emotion["labels"] and face_emotion["faces_detected"] > 0:
        modality_ctx.append("表情情绪：" + "、".join(f"{l}({s})" for l, s in face_emotion["labels"]))
    if modality_ctx:
        trend_summary = (trend_summary + "；" if trend_summary else "") + "；".join(modality_ctx)

    # 2. LLM 生成回复 + 风险推理（趋势摘要拼进 Prompt，模型可感知"嘴上没事、实际恶化"）
    result = await generate_reply(text, context_summary=trend_summary)

    # 3. 矛盾提升（PRD 9.2 步骤 5 + V6.2 单次请求内判定）：
    #    文本低风险（3/4级）但表情或语音极高痛苦 → 自动提升一级（riskLevel 数值减 1）
    DISTRESS_THRESHOLD = 0.6  # 高痛苦概率阈值（可由调试台配置）
    distress_sources = []
    if face_emotion and face_emotion["faces_detected"] > 0 and face_emotion["distress_score"] >= DISTRESS_THRESHOLD:
        distress_sources.append("表情")
    if audio_emotion and audio_emotion["distress_score"] >= DISTRESS_THRESHOLD:
        distress_sources.append("语音")
    if result["riskLevel"] >= 3 and distress_sources:
        result["riskLevel"] = max(1, result["riskLevel"] - 1)
        result["reason"] = (result.get("reason") or "") + f"；矛盾提升（文本低风险但{'/'.join(distress_sources)}极高痛苦）"

    # 4. 趋势提升规则（PRD 9.2 步骤 5）：Mem0 显示近期情绪持续恶化 → 自动提升一级
    #    （提升一级 = riskLevel 数值减 1；不低于 2 级——趋势提升不会直接到 1 级危机）
    if result["riskLevel"] >= 2 and memory_service.is_worsening(db, user.id, window=3, threshold=3):
        result["riskLevel"] = max(2, result["riskLevel"] - 1)
        result["reason"] = (result.get("reason") or "") + "；触发趋势提升（近期情绪持续恶化）"

    # 2. 按 PRD 8.2 映射表组装 intervention
    hotlines = [
        {"id": h.id, "name": h.name, "phone": h.phone, "description": h.description, "level": h.level}
        for h in db.query(Hotline).order_by(Hotline.level).all()
    ]
    self_help = [
        {"id": s.id, "title": s.title, "type": s.type, "duration": s.duration,
         "desc": s.description,
         "suitableLevels": json.loads(s.suitable_levels or "[3]")}
        for s in db.query(SelfHelp).filter(SelfHelp.status == "active").all()
    ]
    intervention = build_intervention(result["riskLevel"], hotlines, self_help)

    # 4. 落库
    db.add(Message(conversation_id=conv_id, role="user", content=text or "[语音/表情]",
                   audio_url=body.get("audioUrl", ""), image_url=body.get("imageUrl", ""),
                   risk_level=result["riskLevel"]))
    db.add(Message(conversation_id=conv_id, role="ai", content=result["replyText"]))
    # 会话标题取首条用户输入
    if conv.title == "新的倾诉" and text:
        conv.title = text[:16]
    db.commit()

    # 5. 对话后：写入记忆（情绪快照，供下次趋势判断）
    memory_service.add(db, user.id, conv_id, text, result["riskLevel"])

    # 4. 一级/二级自动生成预警（PRD 9.3：后台人工跟进）
    if result["riskLevel"] in (1, 2):
        db.add(RiskAlert(user_id=user.id, conversation_id=conv_id,
                         level=result["riskLevel"], trigger_words=result["reason"][:200]))
        db.commit()

    return ok({
        "replyText": result["replyText"],
        "digitalHumanAction": ACTION_MAP[result["riskLevel"]],
        "riskLevel": result["riskLevel"],
        "intervention": intervention,
        "asrText": text if "audio" in input_types else "",  # 语音输入时返回 ASR 转写（前端回填）
    })


# ---------- 记录列表：GET /conversations ----------
@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.created_at.desc())
        .all()
    )
    def friendly_time(dt):
        if not dt:
            return ""
        from datetime import datetime as _dt
        now = _dt.utcnow()
        if dt.date() == now.date():
            return "今天 " + dt.strftime("%H:%M")
        if (now - dt).days == 1:
            return "昨天 " + dt.strftime("%H:%M")
        return dt.strftime("%m-%d %H:%M")

    return ok([
        {
            "id": c.id, "title": c.title,
            "time": friendly_time(c.created_at),
            "desc": "",
        }
        for c in convs
    ])


# ---------- 对话详情：GET /conversations/{id} ----------
def _conv_messages(db, conv_id):
    msgs = db.query(Message).filter(Message.conversation_id == conv_id).order_by(Message.id).all()
    return [
        {"role": m.role, "content": m.content, "riskLevel": m.risk_level}
        for m in msgs
    ]


@router.get("/conversations/{conv_id}")
def conversation_detail(conv_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise BizError(404, "记录不存在")
    return ok(_conv_messages(db, conv_id))


# ---------- 删除 / 一键清除：DELETE /conversations/{id} ----------
# V6.1：清除范围 = 业务库对话记录 + Mem0 向量库记忆；预警记录保留
@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if conv_id == "all":
        convs = db.query(Conversation).filter(Conversation.user_id == user.id).all()
        for c in convs:
            db.query(Message).filter(Message.conversation_id == c.id).delete()
            db.delete(c)
        # V6.1：清除范围 = 业务库对话记录 + 记忆（向量库），预警记录保留
        memory_service.clear_user(db, user.id)
        db.commit()
        return ok({"cleared": "conversations+memories"})
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise BizError(404, "记录不存在")
    db.query(Message).filter(Message.conversation_id == conv_id).delete()
    db.delete(conv)
    db.commit()
    return ok({"deleted": conv_id})


# ---------- 热线：GET /hotlines ----------
@router.get("/hotlines")
def hotlines(db: Session = Depends(get_db)):
    list_ = db.query(Hotline).order_by(Hotline.level).all()
    return ok([
        {"id": h.id, "name": h.name, "phone": h.phone, "description": h.description, "level": h.level}
        for h in list_
    ])


# ---------- 自助资源：GET /self-help ----------
@router.get("/self-help")
def self_help_list(db: Session = Depends(get_db)):
    list_ = db.query(SelfHelp).filter(SelfHelp.status == "active").all()
    return ok([
        {"id": s.id, "title": s.title, "type": s.type, "duration": s.duration,
         "desc": s.description, "suitableLevels": json.loads(s.suitable_levels or "[3]")}
        for s in list_
    ])


# ---------- 3D 数字人 web-view 地址：GET /digital-human/view ----------
@router.get("/digital-human/view")
def digital_human_view(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """返回 H5 宿主页完整 URL（含密钥参数）+ 是否已配置。
    小程序 web-view 直接加载该 URL 即可渲染 3D 数字人。"""
    from config import DH_APP_ID, DH_APP_SECRET, LLM_MODEL  # noqa
    from config import DH_APP_ID, DH_APP_SECRET
    if not DH_APP_ID or not DH_APP_SECRET:
        return ok({"configured": False, "url": ""})
    base = os.getenv("PUBLIC_BASE_URL", "http://192.168.110.220:8000")
    from urllib.parse import quote
    url = f"{base}/digital-human/index.html?appid={DH_APP_ID}&secret={quote(DH_APP_SECRET)}"
    return ok({"configured": True, "url": url})


# ---------- 预警上报：POST /risk-alerts ----------
@router.post("/risk-alerts")
def report_risk_alert(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = RiskAlert(
        user_id=user.id,
        conversation_id=body.get("conversationId", ""),
        level=int(body.get("level", 2)),
        trigger_words=body.get("reason", "小程序端上报"),
    )
    db.add(alert)
    db.commit()
    return ok({"alertId": alert.id, "status": alert.status})
