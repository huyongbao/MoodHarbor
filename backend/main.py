"""FastAPI 入口 —— 情绪树洞后端（阶段二骨架）
启动：cd backend && uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from common import install_exception_handlers
from config import APP_NAME, VERSION, UPLOAD_DIR
from database import Base, engine, SessionLocal
from models import entities  # noqa: F401 确保建表
from routers.miniprogram import router as mp_router
from routers.admin import router as admin_router
from routers.debug_ws import router as debug_router
import json as _json

ALL_PERMISSIONS = [
    "dashboard:view", "users:view", "users:edit", "conversations:view",
    "alerts:view", "alerts:handle",
    "debug:multimodal", "debug:intervention", "debug:digital-human",
    "debug:resources", "debug:memories",
    "accounts:manage", "roles:manage",
]
OPERATOR_PERMISSIONS = ALL_PERMISSIONS[:5]
json = _json

app = FastAPI(title=APP_NAME, version=VERSION)

# CORS（管理后台 Vue3 开发期跨域）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

install_exception_handlers(app)

# 业务路由统一挂在 /api/v1（PRD 8.1 BaseURL）
app.include_router(mp_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(debug_router, prefix="/api/v1")

# 上传文件静态服务（开发期；正式版换对象存储/CDN）
import os
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 3D 数字人宿主页（魔珐星云 SDK，小程序 web-view 载体）
from fastapi.staticfiles import StaticFiles as _SMS
app.mount("/digital-human", _SMS(directory=os.path.join(os.path.dirname(__file__), "digital_human"), html=True), name="digital-human")

# 数字人 H5 强制不缓存（web-view 会缓存静态资源，导致改版不生效、探针日志看不到）
@app.middleware("http")
async def _dh_no_cache(request, call_next):
    resp = await call_next(request)
    if request.url.path.startswith("/digital-human"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
    return resp

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---------- 种子数据（热线按 PRD 十章）----------
SEED_DIGITAL_HUMANS = [
    {"id": "dh_01", "name": "小满", "trait": "温柔耐心", "quote": "慢慢说，我一直在听", "avatar_url": "/images/avatars/xiaoman.jpg", "prompt": "你是\"小满\"，一位温柔耐心的数字心理疏导师，服务新就业形态劳动者。遵循四级干预策略：高危紧急转介热线、中危推荐热线、低危推送自助资源、正常温和回应。不评判、不催促、先共情再回应。", "class_name": "warm"},
    {"id": "dh_02", "name": "知远", "trait": "沉稳可靠", "quote": "先歇口气，别一个人扛", "avatar_url": "/images/avatars/zhiyuan.jpg", "prompt": "你是\"知远\"，一位沉稳可靠的数字心理疏导师，服务新就业形态劳动者。遵循四级干预策略。先稳定情绪，再引导行动。", "class_name": "calm"},
]
SEED_HOTLINES = [
    # 核心危机干预热线 4 条（契约 4.6）
    {"name": "全国统一心理援助热线", "phone": "12356", "description": "24 小时 · 全国", "audience": "全部用户", "level": "高危", "status": "active"},
    {"name": "南京“宁师傅”热线", "phone": "025-96889910", "description": "职工心理支持", "audience": "职工群体", "level": "高危", "status": "active"},
    {"name": "南京市妇联热线", "phone": "12338", "description": "妇女心理与权益支持", "audience": "妇女", "level": "高危", "status": "active"},
    {"name": "江苏·南京 12355 青少年服务台", "phone": "12355", "description": "心理与成长支持", "audience": "青少年", "level": "高危", "status": "active"},
    # 补充支持渠道 4 条
    {"name": "南京脑科医院 心理门诊", "phone": "025-83712977", "description": "失眠门诊/心理门诊挂号咨询", "audience": "全部用户", "level": "中危", "status": "active"},
    {"name": "“宁工享”微信公众号心理模块", "phone": "-", "description": "南京市总工会线上心理服务", "audience": "职工群体", "level": "中危", "status": "active"},
    {"name": "宁小蜂驿站心理健康活动", "phone": "-", "description": "新就业形态劳动者驿站活动", "audience": "职工群体", "level": "低危", "status": "active"},
    {"name": "江苏省大学生 24 小时心理热线", "phone": "025-58255200", "description": "大学生心理援助", "audience": "大学生", "level": "中危", "status": "active"},
]
SEED_SELF_HELP = [
    {"id": "sh_01", "title": "三分钟呼吸放松", "type": "放松音频", "suitable_levels": "[2, 3]", "duration": "3 分钟", "description": "跟随引导完成一次腹式呼吸练习，快速平复紧绷情绪"},
    {"id": "sh_02", "title": "下班后放松", "type": "放松音频", "suitable_levels": "[3]", "duration": "7 分钟", "description": "卸下忙碌一天的疲惫，给身体一个缓冲"},
    {"id": "sh_03", "title": "缓解愤怒", "type": "冥想引导", "suitable_levels": "[3]", "duration": "5 分钟", "description": "给情绪一个缓冲空间，避免冲动决定"},
    {"id": "sh_04", "title": "安心入睡", "type": "轻音乐", "suitable_levels": "[3]", "duration": "12 分钟", "description": "在温和引导中慢慢休息"},
    {"id": "sh_05", "title": "楼下走走：五分钟步行的力量", "type": "运动建议", "suitable_levels": "[3]", "duration": "", "description": "忙完这单抽空出去走走，哪怕楼下转一圈"},
]
SEED_ROLES = [
    {"id": 1, "name": "superadmin", "label": "超级管理员", "description": "拥有全部功能权限",
     "permissions": json.dumps(ALL_PERMISSIONS)},
    {"id": 2, "name": "operator", "label": "运营人员", "description": "默认前 5 项权限",
     "permissions": json.dumps(OPERATOR_PERMISSIONS)},
]
SEED_ADMINS = [
    {"username": "superadmin", "password": "admin123", "role_id": 1},
    {"username": "operator", "password": "operator123", "role_id": 2},
]


def _ensure_alert_columns():
    """SQLite 兼容迁移：旧库 risk_alerts 补齐升级链路/备注字段（create_all 不会给已有表加列）"""
    from sqlalchemy import text

    ddl = [
        ("remark", "ALTER TABLE risk_alerts ADD COLUMN remark TEXT DEFAULT ''"),
        ("escalated_from", "ALTER TABLE risk_alerts ADD COLUMN escalated_from INTEGER"),
        ("escalated_at", "ALTER TABLE risk_alerts ADD COLUMN escalated_at DATETIME"),
        ("escalated_reason", "ALTER TABLE risk_alerts ADD COLUMN escalated_reason TEXT DEFAULT ''"),
    ]
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(risk_alerts)"))}
        for name, stmt in ddl:
            if cols and name not in cols:
                conn.execute(text(stmt))
        conn.commit()


def _preheat_models():
    """后台线程预热多模态模型（FunASR/emotion2vec/Py-Feat），避免首次请求 30s 冷启动"""
    import threading

    def _warm():
        try:
            from services import audio_service, face_service
            audio_service._get_asr()
            audio_service._get_emo()
            face_service._get_detector()
            print("[preheat] 多模态模型预热完成")
        except Exception as e:
            print(f"[preheat] 预热失败（不影响服务）: {e}")

    threading.Thread(target=_warm, daemon=True).start()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _ensure_alert_columns()
    db = SessionLocal()
    try:
        if db.query(entities.DigitalHuman).count() == 0:
            for d in SEED_DIGITAL_HUMANS:
                db.add(entities.DigitalHuman(**d))
        if db.query(entities.Hotline).count() == 0:
            for h in SEED_HOTLINES:
                db.add(entities.Hotline(**h))
        if db.query(entities.SelfHelp).count() == 0:
            for s in SEED_SELF_HELP:
                db.add(entities.SelfHelp(**s))
        if db.query(entities.Role).count() == 0:
            for r in SEED_ROLES:
                db.add(entities.Role(**r))
        if db.query(entities.AdminAccount).count() == 0:
            for a in SEED_ADMINS:
                db.add(entities.AdminAccount(**a))
        db.commit()
    finally:
        db.close()
    _preheat_models()


@app.get("/")
def root():
    return {"code": 0, "message": "情绪树洞 API 运行中", "data": {"version": VERSION}}
