"""表情多模态服务 —— Py-Feat 表情情绪识别（M1 Max 本地部署）
PRD 选型：Py-Feat 输出情绪概率（悲伤/愤怒/恐惧等），供矛盾提升规则使用。
py-feat 2.x API：Detectorv1 输出经典 7 类情绪概率（emotion_probcols）。
"""
import logging
import time

logger = logging.getLogger("face_service")

_detector = None

# Py-Feat 7 类情绪 → 高痛苦情绪集（供矛盾提升规则）
HIGH_DISTRESS = {"sadness", "fear"}
NEGATIVE = {"anger", "sadness", "fear", "disgust"}


def _get_detector():
    global _detector
    if _detector is None:
        from feat import Detectorv1
        _detector = Detectorv1()
    return _detector


def analyze_face(image_path: str, top_k: int = 3) -> dict:
    """表情图 → 情绪概率分布。
    返回 {labels: [(情绪, 概率)...], distress_score, latency_s, faces_detected}
    distress_score: sadness + fear 概率之和（PRD：表情极高痛苦）
    无人脸时 distress_score = 0，faces_detected = 0
    """
    t0 = time.time()
    try:
        d = _get_detector()
        result = d.detect(image_path, progress_bar=False)
    except Exception as e:
        logger.warning(f"表情识别失败: {e}")
        return {"labels": [], "distress_score": 0.0, "latency_s": round(time.time() - t0, 2), "faces_detected": 0}

    if result is None or len(result) == 0:
        return {"labels": [], "distress_score": 0.0, "latency_s": round(time.time() - t0, 2), "faces_detected": 0}

    # 取第一张脸（多人脸场景取主脸），列名为情绪名直列（anger/disgust/fear/...）
    row = result.iloc[0]
    EMOTIONS = ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"]
    probs = {emo: float(row[emo]) for emo in EMOTIONS if emo in result.columns}
    pairs = sorted(probs.items(), key=lambda x: -x[1])
    distress = sum(probs.get(e, 0.0) for e in HIGH_DISTRESS)
    return {
        "labels": [(l, round(s, 4)) for l, s in pairs[:top_k]],
        "distress_score": round(distress, 4),
        "latency_s": round(time.time() - t0, 2),
        "faces_detected": 1,
    }


if __name__ == "__main__":
    print(analyze_face("/tmp/test_face.jpg"))
