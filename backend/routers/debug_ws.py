"""调试台 WS 推流服务 —— 契约 4.12 完整实现
架构：小程序 HTTP 分片上报（关键帧/音频/文本）→ 后端多模态分析 → WS 广播给管理台
5 类消息：session_start / modality_update / contradiction_analysis / assistant_reply / session_end
"""
import asyncio
import base64
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from auth import parse_token
from common import ok, BizError
from config import UPLOAD_DIR
from database import get_db
from models.entities import User, RiskAlert, AdminAccount
from services import audio_service, face_service, memory_service
from services.llm_provider import generate_reply, build_intervention, ACTION_MAP, analyze_contradiction

logger = logging.getLogger("debug_ws")

router = APIRouter()


# ---------- 鉴权依赖（双 token：小程序 JWT {uid} / 管理端 JWT {aid}）----------
# 调试链路的预警落库、记忆沉淀都需要 user_id，管理台本机采集统一挂到"调试演示用户"
DEBUG_ACTOR_OPENID = "admin_debug_actor"


def _get_actor(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    from auth import parse_token as _pt
    from common import BizError as _BE
    if not authorization.startswith("Bearer "):
        raise _BE(401, "未登录")
    payload = _pt(authorization[7:])
    if payload.get("uid"):
        u = db.query(User).filter(User.id == payload["uid"]).first()
        if u:
            return u
    if payload.get("aid"):
        admin = db.query(AdminAccount).filter(AdminAccount.id == payload["aid"]).first()
        if admin:
            u = db.query(User).filter(User.openid == DEBUG_ACTOR_OPENID).first()
            if not u:
                u = User(openid=DEBUG_ACTOR_OPENID, nickname="调试演示用户")
                db.add(u)
                db.commit()
                db.refresh(u)
            return u
    raise _BE(401, "用户不存在")


# ---------- WS 连接池（管理台观众）----------
_dashboard_clients: set = set()

# ---------- 活跃调试会话 ----------
_sessions: dict = {}  # session_id -> {userId, history:[], contradictionHits, trendHits, maxLevel, startedAt}


def _now_ms():
    return int(time.time() * 1000)




async def _broadcast(message: dict):
    """广播给所有管理台 WS 观众"""
    dead = []
    for ws in _dashboard_clients:
        try:
            await ws.send_text(json.dumps(message, ensure_ascii=False))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _dashboard_clients.discard(ws)


_main_loop: asyncio.AbstractEventLoop = None


def broadcast_sync(message: dict):
    """同步上下文里用：把广播丢进 FastAPI 主事件循环"""
    global _main_loop
    if _main_loop and _main_loop.is_running():
        asyncio.run_coroutine_threadsafe(_broadcast(message), _main_loop)
    else:
        logger.warning("事件循环未就绪，消息丢弃: %s", message.get("type"))


# ================= 管理台 WS 端点（契约 4.12）=================
@router.websocket("/admin/ws/debug/multimodal")
async def debug_multimodal_ws(websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    try:
        parse_token(token)
    except Exception:
        await websocket.close(code=4401)
        return
    global _main_loop
    _main_loop = asyncio.get_event_loop()
    await websocket.accept()
    _dashboard_clients.add(websocket)
    logger.info(f"管理台观察者接入，当前 {len(_dashboard_clients)} 个")
    try:
        while True:
            # 只接收心跳；消息全部服务端下发
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        _dashboard_clients.discard(websocket)


# ================= 小程序上报端点（HTTP 分片）=================
# 会话开始：POST /mp/debug/stream/start {conversationId}
@router.post("/mp/debug/stream/start")
def stream_start(body: dict, user: User = Depends(_get_actor), db: Session = Depends(get_db)):
    session_id = "s_dbg_" + uuid.uuid4().hex[:8]
    _sessions[session_id] = {
        "userId": user.id,
        "conversationId": body.get("conversationId", ""),
        "history": [],
        "contradictionHits": 0,
        "trendHits": 0,
        "maxLevel": 4,
        "startedAt": _now_ms(),
    }
    if user.last_active_at is None:
        from datetime import datetime as dt
        user.last_active_at = dt.utcnow()
        db.commit()
    broadcast_sync({
        "type": "session_start",
        "sessionId": session_id,
        "userId": user.id,
        "startedAt": _now_ms(),
    })
    return ok({"sessionId": session_id})


# 关键帧上报：POST /mp/debug/stream/frame {sessionId, frame(base64 jpg)}
@router.post("/mp/debug/stream/frame")
async def stream_frame(body: dict, user: User = Depends(_get_actor)):
    sess = _get_session(body.get("sessionId", ""))
    frame_b64 = (body.get("frame") or "").split(",")[-1]  # 兼容 dataURL
    if not frame_b64:
        return ok(None)

    # 1. 帧先转发（低延迟优先）：不等分析，立刻广播给管理台
    msg = {"type": "modality_update", "sessionId": sess and body.get("sessionId"),
           "timestamp": _now_ms(),
           "video": {"frame": "data:image/jpeg;base64," + frame_b64}}
    broadcast_sync(msg)

    # 2. 表情分析异步化：丢后台线程执行，完成后单独广播（不阻塞帧流）
    #    丢帧保护：上一帧还在分析时跳过本帧（Py-Feat ~1s/帧，500ms 推流间隔下跳一半属正常）
    if sess is not None and not getattr(stream_frame, "_analyzing", False):
        stream_frame._analyzing = True

        def _analyze_async():
            tmp_path = os.path.join(UPLOAD_DIR, f"dbg_{uuid.uuid4().hex[:8]}.jpg")
            try:
                with open(tmp_path, "wb") as f:
                    f.write(base64.b64decode(frame_b64))
                r = face_service.analyze_face(tmp_path)
                if r["faces_detected"]:
                    top_emotion, top_conf = r["labels"][0]
                    mapping = {"happiness": "happy", "neutral": "calm", "sadness": "sad",
                               "fear": "fear", "anger": "angry", "disgust": "angry", "surprise": "calm"}
                    facial = {"emotion": mapping.get(top_emotion, "calm"),
                              "confidence": round(top_conf, 2)}
                    sess.update({"facial": facial})
                    broadcast_sync({
                        "type": "modality_update", "sessionId": body.get("sessionId"),
                        "timestamp": _now_ms(), "facial": facial,
                    })
            except Exception as e:
                logger.warning(f"帧分析失败: {e}")
            finally:
                stream_frame._analyzing = False
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

        # 固定交给 FACE_EXECUTOR（单线程）：Py-Feat 原生对象跨线程调用会崩
        from services.infer_lock import FACE_EXECUTOR
        FACE_EXECUTOR.submit(_analyze_async)
    return ok(None)


# 音频段上报：POST /mp/debug/stream/audio-base64 {sessionId, audio(base64)}
# 后端做 ASR 转写 + emotion2vec 语音情感，广播 voice/asr 模态（契约 4.12）
# ★ 完成后自动触发完整判定链（文本风险+语音+表情融合 → 矛盾分析 → 数字人回应）
@router.post("/mp/debug/stream/audio-base64")
async def stream_audio_b64(body: dict, user: User = Depends(_get_actor), db: Session = Depends(get_db)):
    sess = _get_session(body.get("sessionId", ""))
    # 前端传的是 dataURL（data:audio/wav;base64,xxx），必须剥掉前缀再解码，
    # 否则 b64decode 会因非法字符/长度不对直接抛错，表现为卡片一直是"—"
    audio_b64 = (body.get("audio") or "").split(",")[-1]
    if not sess or not audio_b64:
        return ok(None)

    # 背压：上一段还在识别/判定时丢弃本段（前端 5s 一段，正常不会触发；
    # 一旦推理变慢必须丢帧，否则任务堆积会把 CPU 抢光、整个后端 15s 超时）
    if getattr(stream_audio_b64, "_busy", False):
        logger.info("上一段音频仍在分析，丢弃本段")
        return ok(None)
    stream_audio_b64._busy = True
    try:
        return await _analyze_audio_segment(body, sess, user, db, audio_b64)
    finally:
        stream_audio_b64._busy = False


async def _analyze_audio_segment(body, sess, user, db, audio_b64):
    # base64 → 临时 wav → FunASR + emotion2vec
    import base64 as _b64
    tmp = os.path.join(UPLOAD_DIR, f"dbg_audio_{uuid.uuid4().hex[:8]}.wav")
    try:
        with open(tmp, "wb") as f:
            f.write(_b64.b64decode(audio_b64))
        # 走 audio_service 的专属线程封装（模型跨线程调用会原生崩溃）
        asr_out = await audio_service.transcribe_async(tmp)
        emo_out = await audio_service.analyze_emotion_async(tmp)
    except Exception as e:
        logger.warning(f"语音段分析失败: {e}")
        return ok(None)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass

    # emotion2vec 标签 → 契约 5 类
    top_l, top_c = emo_out["labels"][0] if emo_out["labels"] else ("中立/neutral", 1.0)
    mapping = {"开心/happy": "happy", "中立/neutral": "calm", "难过/sad": "sad",
               "担忧/worried": "sad", "焦虑/anxious": "fear", "害怕/fearful": "fear",
               "生气/angry": "angry", "厌恶/disgusted": "angry", "吃惊/surprised": "calm"}
    voice = {"emotion": mapping.get(top_l, "calm"), "confidence": round(top_c, 2)}
    sess.update({"voice": voice})

    # 广播：语音情感 + ASR 最终句
    sid = body.get("sessionId")
    broadcast_sync({
        "type": "modality_update", "sessionId": sid, "timestamp": _now_ms(),
        "voice": voice,
    })
    text = asr_out.get("text") or ""
    if text:
        broadcast_sync({
            "type": "modality_update", "sessionId": sid, "timestamp": _now_ms(),
            "asr": {"text": text, "isFinal": True},
        })
        # ★ ASR 有内容：自动触发完整判定链（语音倾诉 = 一句话全模态分析）
        await _run_judgment_chain(sid, sess, text, user, db)
    return ok({"text": text, "emotion": voice})


# ---------- 公共判定链：文本风险 + 语音/表情融合 → 矛盾分析 → 预警 → 数字人回应 ----------
async def _run_judgment_chain(session_id: str, sess: dict, text: str, user, db):
    """语音/文本倾诉后统一触发：管理台实时看到完整多模态判定。"""
    # 1. LLM 文本情感 + 记忆趋势
    trend_summary = memory_service.get_trend(db, user.id, n=10)
    result = await generate_reply(text, context_summary=trend_summary)
    text_emotion = {"riskLevel": result["riskLevel"], "confidence": result["confidence"]}
    broadcast_sync({
        "type": "modality_update", "sessionId": session_id, "timestamp": _now_ms(),
        "textEmotion": text_emotion,
    })

    # 2. 判定链可视化（融合会话内最新 facial/voice）
    facial = sess.get("facial")
    voice = sess.get("voice")
    steps, final_level, consistent = _judgment_chain(result, facial, voice, sess, text, db, user)
    broadcast_sync({
        "type": "contradiction_analysis", "sessionId": session_id, "timestamp": _now_ms(),
        "input": {"text": text_emotion, "facial": facial, "voice": voice, "asrText": text},
        "steps": steps,
        "final": {"riskLevel": final_level, "consistent": consistent,
                  "confidence": result["confidence"]},
    })

    # 2.5 大模型矛盾分析（三模态齐备时）：LLM 判断言行是否一致，完成后异步广播 contradiction_llm
    #     不阻塞判定链主流程；LLM 不可用时 analyze_contradiction 内部走规则兜底（source='rule'）
    if facial and voice and text:
        async def _llm_contra_task():
            try:
                analysis = await analyze_contradiction(text, result["riskLevel"], facial, voice)
                await _broadcast({
                    "type": "contradiction_llm", "sessionId": session_id,
                    "timestamp": _now_ms(), "analysis": analysis,
                })
            except Exception as e:
                logger.warning(f"LLM 矛盾分析失败: {e}")
        asyncio.create_task(_llm_contra_task())

    # 3. 落库：记忆 + 一二级预警
    memory_service.add(db, user.id, sess.get("conversationId", ""), text, final_level)
    if final_level in (1, 2):
        db.add(RiskAlert(user_id=user.id, conversation_id=sess.get("conversationId", ""),
                         level=final_level, trigger_words=result["reason"][:200]))
        db.commit()

    # 4. 数字人回应
    broadcast_sync({
        "type": "assistant_reply", "sessionId": session_id, "timestamp": _now_ms(),
        "text": result["replyText"],
    })
    return final_level, result


# 文本/ASR 最终句上报：POST /mp/debug/stream/text {sessionId, text}
@router.post("/mp/debug/stream/text")
async def stream_text(body: dict, user: User = Depends(_get_actor), db: Session = Depends(get_db)):
    session_id = body.get("sessionId", "")
    sess = _get_session(session_id)
    text = body.get("text", "")
    if not sess or not text:
        return ok(None)

    # 1. 广播 ASR 最终句
    broadcast_sync({
        "type": "modality_update", "sessionId": session_id, "timestamp": _now_ms(),
        "asr": {"text": text, "isFinal": True},
    })

    # 2. 完整判定链（公共函数：文本情感 + 语音/表情融合 + 矛盾分析 + 数字人回应）
    final_level, result = await _run_judgment_chain(session_id, sess, text, user, db)
    return ok({"riskLevel": final_level, "replyText": result["replyText"],
               "digitalHumanAction": ACTION_MAP[final_level]})


# 会话结束：POST /mp/debug/stream/end {sessionId}
@router.post("/mp/debug/stream/end")
def stream_end(body: dict, user: User = Depends(_get_actor)):
    session_id = body.get("sessionId", "")
    sess = _sessions.pop(session_id, None)
    if not sess:
        return ok(None)
    broadcast_sync({
        "type": "session_end", "sessionId": session_id, "endedAt": _now_ms(),
        "summary": {
            "rounds": len(sess["history"]),
            "contradictionHits": sess["contradictionHits"],
            "trendHits": sess["trendHits"],
            "maxLevel": sess["maxLevel"],
        },
    })
    return ok(None)


# ---------- 判定链（对齐契约 4.12 与前端 analyzeContradiction 展示逻辑）----------
def _judgment_chain(result, facial, voice, sess, text, db, user):
    """返回 (steps, final_level, consistent)——与前端 Mock 版本完全同源的规则"""
    steps = []
    DISTRESS = ["sad", "fear", "angry"]
    THRESH = 0.7
    level = result["riskLevel"]
    pct = lambda v: f"{round(v * 100)}%"

    # ① 模型初始判定
    steps.append({"key": "model", "name": "① 模型初始判定（EmoLLM）", "triggered": True,
                   "detail": f"文本情感判定 {result['riskLevel']} 级，置信度 {pct(result['confidence'])}"})

    # ② 置信度融合
    from services.llm_provider import rule_fallback
    fb_level, _, _ = rule_fallback(text)
    if result["confidence"] >= 0.8:
        steps.append({"key": "confidence", "name": "② 置信度融合", "triggered": False,
                      "detail": f"置信度 {pct(result['confidence'])} ≥ 0.80，直接采信模型结果"})
    else:
        level = min(result["riskLevel"], fb_level)
        steps.append({"key": "confidence", "name": "② 置信度融合", "triggered": True,
                      "detail": f"置信度 {pct(result['confidence'])} < 0.80，与规则兜底融合取更高（模型 {result['riskLevel']} 级/规则 {fb_level} 级 → {level} 级）"})

    # ③ 规则兜底
    if result["confidence"] < 0.8 and fb_level == 1:
        level = 1
        steps.append({"key": "rule_fallback", "name": "③ 规则兜底（防漏报）", "triggered": True,
                      "detail": "低置信但命中极高危表达，强制提升为一级，防止漏报"})
    else:
        steps.append({"key": "rule_fallback", "name": "③ 规则兜底（防漏报）", "triggered": False,
                      "detail": "未命中极高危词，不干预"})

    # ④ 矛盾提升
    facial_hit = bool(facial and facial["emotion"] in DISTRESS and facial["confidence"] >= THRESH)
    voice_hit = bool(voice and voice["emotion"] in DISTRESS and voice["confidence"] >= THRESH)
    if level >= 3 and (facial_hit or voice_hit):
        signals = [x and f"表情「{x['emotion']}」{pct(x['confidence'])}" for x in [facial if facial_hit else None]]
        signals += [x and f"语音「{x['emotion']}」{pct(x['confidence'])}" for x in [voice if voice_hit else None]]
        signals = "、".join(s for s in signals if s)
        steps.append({"key": "contradiction", "name": "④ 矛盾提升检测", "triggered": True,
                      "detail": f"文本 {level} 级（低风险），但 {signals} 检出高痛苦信号 → 自动提升一级：{level} → {level - 1}"})
        level -= 1
        sess["contradictionHits"] += 1
    else:
        steps.append({"key": "contradiction", "name": "④ 矛盾提升检测", "triggered": False,
                      "detail": "表情/语音未检出高痛苦信号，与文本方向一致" if level >= 3 else "文本已属高风险（≤2级），无需矛盾提升"})

    # ⑤ 趋势提升（近三轮同等级且 ≤3）
    sess["history"].append(level)
    seq = sess["history"][-3:]
    if len(seq) == 3 and len(set(seq)) == 1 and seq[0] <= 3:
        steps.append({"key": "trend", "name": "⑤ 趋势提升检测（Mem0）", "triggered": True,
                      "detail": f"连续三轮风险持续为 {level} 级，情绪趋势持续恶化 → 提升一级：{level} → {level - 1}"})
        level -= 1
        sess["trendHits"] += 1
    else:
        steps.append({"key": "trend", "name": "⑤ 趋势提升检测（Mem0）", "triggered": False,
                      "detail": "无连续同等级恶化趋势"})

    sess["maxLevel"] = min(sess["maxLevel"], level)
    consistent = not (result["riskLevel"] >= 3 and (facial_hit or voice_hit))
    return steps, level, consistent


def _get_session(session_id: str):
    return _sessions.get(session_id)
