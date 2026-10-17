"""FastAPI 入口 —— 歇会儿后端（阶段二骨架）
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

# 自助资源音频（管理台资源库 + 小程序端播放），url 存相对路径 /audio/xxx.mp3
app.mount("/audio", _SMS(directory=os.path.join(os.path.dirname(__file__), "audio")), name="self-help-audio")

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
    # 内容对齐原管理台 Mock 资源库（音频位于 backend/audio/，url 为相对路径，由 /audio 静态服务提供）
    {"id": "sh_01", "title": "三分钟呼吸放松", "type": "放松音频", "suitable_levels": "[2, 3]", "duration": "", "description": "舒缓钢琴轻音乐，适合配合腹式呼吸练习平复紧绷情绪", "url": "/audio/breathing-music.mp3", "status": "active"},
    {"id": "sh_02", "title": "雨天白噪音", "type": "轻音乐", "suitable_levels": "[3]", "duration": "", "description": "舒缓雨声白噪音，适合午休或睡前循环播放", "url": "/audio/rain-noise.mp3", "status": "active"},
    {"id": "sh_03", "title": "身体扫描冥想", "type": "轻音乐", "suitable_levels": "[2, 3]", "duration": "", "description": "舒缓轻音乐，适合配合身体扫描练习从头到脚逐步放松，缓解久坐驾驶疲劳", "url": "/audio/body-scan.mp3", "status": "active"},
    {"id": "sh_04", "title": "收工后快走 20 分钟", "type": "运动建议", "suitable_levels": "[3]", "duration": "", "description": "低强度有氧建议：收车后快走或拉伸 20 分钟，释放压力", "url": "", "status": "active"},
    {"id": "sh_05", "title": "周末近郊散心路线", "type": "旅行建议", "suitable_levels": "[3]", "duration": "", "description": "南京周边低消费散心路线：玄武湖环湖、紫金山绿道等", "url": "", "status": "active"},
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


def _ensure_memory_columns():
    """SQLite 兼容迁移：旧库 memories 补齐 kind / importance（create_all 不会给已有表加列）"""
    from sqlalchemy import text

    ddl = [
        ("kind", "ALTER TABLE memories ADD COLUMN kind VARCHAR(16) DEFAULT 'emotion'"),
        ("importance", "ALTER TABLE memories ADD COLUMN importance VARCHAR(8) DEFAULT 'mid'"),
    ]
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(memories)"))}
        for name, stmt in ddl:
            if cols and name not in cols:
                conn.execute(text(stmt))
        conn.commit()


def _ensure_conversation_columns():
    """SQLite 兼容迁移：旧库 conversations 补齐 status / summary / ended_at（常驻倾诉页会话生命周期）"""
    from sqlalchemy import text

    ddl = [
        ("status", "ALTER TABLE conversations ADD COLUMN status VARCHAR(16) DEFAULT 'active'"),
        ("summary", "ALTER TABLE conversations ADD COLUMN summary VARCHAR(256) DEFAULT ''"),
        ("ended_at", "ALTER TABLE conversations ADD COLUMN ended_at DATETIME"),
    ]
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(conversations)"))}
        for name, stmt in ddl:
            if cols and name not in cols:
                conn.execute(text(stmt))
        conn.commit()


def _preheat_models():
    """预热多模态模型（FunASR/emotion2vec/Py-Feat），避免首次请求 30s+ 冷启动

    必须提交到各模型自己的专属线程（AUDIO_EXECUTOR / FACE_EXECUTOR），
    保证"模型在哪个线程创建，就永远在哪个线程使用"——跨线程会原生崩溃。
    """
    from services.infer_lock import AUDIO_EXECUTOR, FACE_EXECUTOR

    def _warm_audio():
        try:
            from services import audio_service
            audio_service._get_asr()
            audio_service._get_emo()
            print("[preheat] 音频模型预热完成")
        except Exception as e:
            print(f"[preheat] 音频模型预热失败（不影响服务）: {e}")

    def _warm_face():
        try:
            from services import face_service
            face_service._get_detector()
            print("[preheat] 表情模型预热完成")
        except Exception as e:
            print(f"[preheat] 表情模型预热失败（不影响服务）: {e}")

    AUDIO_EXECUTOR.submit(_warm_audio)
    FACE_EXECUTOR.submit(_warm_face)


def _memory_watchdog():
    """每 20 秒打印一次进程峰值内存，用于定位多模态调试时进程被杀的内存曲线"""
    import resource
    import time as _time

    baseline = None
    while True:
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // (1024 * 1024)
        if baseline is None:
            baseline = peak
        print(f"[mem] 峰值RSS={peak}MB (+{peak - baseline}MB)", flush=True)
        _time.sleep(20)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _ensure_alert_columns()
    _ensure_memory_columns()
    _ensure_conversation_columns()
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

    # 内存观测线程（daemon）：多模态调试时追踪峰值内存曲线
    import threading

    threading.Thread(target=_memory_watchdog, daemon=True).start()


@app.get("/")
def root():
    return {"code": 0, "message": "歇会儿 API 运行中", "data": {"version": VERSION}}
