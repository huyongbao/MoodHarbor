"""语音多模态服务 —— FunASR ASR + emotion2vec+ 语音情感（M1 Max 本地部署）
PRD V6.3 技术选型：
  - ASR：paraformer-zh（+ fsmn-vad 切分 + ct-punc 标点）
  - 语音情感：emotion2vec_plus_base，输出 9 类离散情绪概率
模型惰性加载：首次调用时初始化（避免拖慢服务启动），常驻内存。
"""
import time
import logging

from services.infer_lock import INFER_LOCK, limit_torch_threads, AUDIO_EXECUTOR

logger = logging.getLogger("audio_service")

_asr_model = None
_emo_model = None

# emotion2vec+ 9 类情绪 → 风险特征映射（负面情绪集）
NEGATIVE_EMOTIONS = {"生气/angry", "悲伤/sad", "担忧/worried", "焦虑/anxious", "厌恶/disgusted", "害怕/fearful"}
HIGH_DISTRESS = {"悲伤/sad", "担忧/worried", "焦虑/anxious", "害怕/fearful"}


def _get_asr():
    global _asr_model
    if _asr_model is None:
        limit_torch_threads()
        from funasr import AutoModel
        # 注意：不要挂 vad_model / punc_model。沙箱对单进程内存有硬限制（约 4GB 会被
        # SIGKILL），三个模型一起加载峰值 6GB 必被杀。调试段都是 ≤5s 的短音频，
        # 不需要 VAD 切分；标点缺失仅影响展示。若在沙箱外部署可把两者加回。
        _asr_model = AutoModel(
            model="paraformer-zh", disable_update=True, ncpu=2
        )
    return _asr_model


def _get_emo():
    global _emo_model
    if _emo_model is None:
        limit_torch_threads()
        from funasr import AutoModel
        _emo_model = AutoModel(model="iic/emotion2vec_plus_base", disable_update=True)
    return _emo_model


def transcribe(audio_path: str) -> dict:
    """语音转文本。返回 {text, latency_s}"""
    t0 = time.time()
    with INFER_LOCK:  # 串行推理，避免并发抢占 CPU 饿死事件循环
        res = _get_asr().generate(input=audio_path)
    return {"text": res[0]["text"], "latency_s": round(time.time() - t0, 2)}


def analyze_emotion(audio_path: str, top_k: int = 3) -> dict:
    """语音情感分析。返回 {labels: [(情绪, 概率)...], distress_score, latency_s}
    distress_score: 高痛苦情绪（悲伤/担忧/焦虑/害怕）概率之和，供矛盾提升规则使用
    """
    t0 = time.time()
    with INFER_LOCK:
        res = _get_emo().generate(input=audio_path, granularity="utterance", extract_embedding=False)
    labels = res[0]["labels"]
    scores = [float(s) for s in res[0]["scores"]]
    pairs = sorted(zip(labels, scores), key=lambda x: -x[1])
    distress = sum(s for l, s in zip(labels, scores) if l in HIGH_DISTRESS)
    return {
        "labels": [(l, round(s, 4)) for l, s in pairs[:top_k]],
        "distress_score": round(distress, 4),
        "latency_s": round(time.time() - t0, 2),
    }


def process_audio(audio_path: str) -> dict:
    """统一入口：一段音频 → 文本 + 情绪分布。返回 {text, emotion, distress_score}"""
    asr = transcribe(audio_path)
    emo = analyze_emotion(audio_path)
    return {
        "text": asr["text"],
        "emotion": emo["labels"],
        "distress_score": emo["distress_score"],
        "latency_s": asr["latency_s"] + emo["latency_s"],
    }


# ---------- 异步封装：统一在 AUDIO_EXECUTOR 这条专属线程上跑 ----------
# 不要用 asyncio.to_thread（默认线程池是多线程的），模型跨线程调用会原生崩溃
async def transcribe_async(audio_path: str) -> dict:
    import asyncio
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(AUDIO_EXECUTOR, transcribe, audio_path)


async def analyze_emotion_async(audio_path: str) -> dict:
    import asyncio
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(AUDIO_EXECUTOR, analyze_emotion, audio_path)


if __name__ == "__main__":
    # 冒烟自测
    out = process_audio("/tmp/test_speech.wav")
    print(out)
