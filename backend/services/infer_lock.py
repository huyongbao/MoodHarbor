"""推理资源闸门 —— 串行锁 + torch 线程数上限

为什么需要：
- FunASR / emotion2vec / Py-Feat 都是 CPU 密集推理。PyTorch 默认按核数开算子线程，
  多个请求并发时会疯狂抢占 CPU（线程数爆炸），把 uvicorn 事件循环饿死，
  表现为管理台所有请求 15s 超时、WS 心跳断连、/docs 都打不开。
- 演示场景是单用户对话，串行推理完全够用，代价远小于并发抢占。
"""
import os
import threading
from concurrent.futures import ThreadPoolExecutor

# 所有模型推理共用一把可重入锁：同一时刻只跑一个推理任务
INFER_LOCK = threading.RLock()

# 每个模型绑定一条专属线程：
# torch / Py-Feat / OpenCV 的原生对象不是线程安全的，同一个模型被不同线程反复调用
# 会出现原生崩溃（进程直接消失、日志里没有 shutdown 记录）。
# 单线程 executor 保证"模型在哪个线程创建，就永远在哪个线程用"。
FACE_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="infer-face")
AUDIO_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="infer-audio")

_torch_limited = False


def limit_torch_threads(max_threads: int = 4):
    """把 torch 算子线程数压到合理值，避免多请求并发时线程爆炸"""
    global _torch_limited
    if _torch_limited:
        return
    _torch_limited = True
    try:
        import torch

        n = max(1, min(max_threads, (os.cpu_count() or 4) // 2))
        torch.set_num_threads(n)
        try:
            torch.set_num_interop_threads(1)
        except Exception:
            pass  # 已经跑过算子后会抛，忽略即可
    except Exception:
        pass
