/**
 * 调试台 · 本机摄像头 + 麦克风采集器（getUserMedia，不依赖小程序推流）
 *
 * - 视频：<video> 实时预览 + 每 500ms canvas 抓帧 → JPEG(0.5) → base64 dataURL
 * - 音频：AudioContext 采集 PCM → 手工编码 16-bit / 16kHz 单声道 WAV → base64
 *         （MediaRecorder 的 webm/ogg 格式 FunASR 不支持，故手工编码 WAV）
 *         每 segmentMs（默认 5 秒）自动切一段，触发 onAudioChunk 上报后端
 *
 * 用法：
 *   const cap = createLocalCapture({ onFrame, onAudioChunk })
 *   await cap.start(videoEl)   // 会触发浏览器摄像头/麦克风授权
 *   cap.stop()
 */

/** 线性插值降采样到 16k（AudioContext 若被浏览器回退到 44.1k/48k，这里兜底） */
function resampleTo16k(data, srcRate) {
  if (srcRate === 16000) return data
  const ratio = srcRate / 16000
  const len = Math.floor(data.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, data.length - 1)
    const frac = pos - i0
    out[i] = data[i0] * (1 - frac) + data[i1] * frac
  }
  return out
}

/** Float32 PCM → 16-bit WAV → base64（dataURL，含 mime 前缀） */
function encodeWavBase64(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  // 二进制 → base64：分块拼接，避免 String.fromCharCode 栈溢出
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return 'data:audio/wav;base64,' + btoa(bin)
}

export function createLocalCapture({ onFrame, onAudioChunk, frameInterval = 500, segmentMs = 5000 } = {}) {
  let stream = null
  let videoEl = null
  let audioCtx = null
  let source = null
  let processor = null
  let frameTimer = null
  let segmentTimer = null
  let canvas = null
  let pcmBuffers = []
  let pcmSamples = 0
  let running = false

  /** 把已积累的 PCM 切成一段 WAV 上报（stop 前也会调用，收尾最后不足 5s 的段） */
  function flushAudio() {
    if (!running || !pcmSamples || !pcmBuffers.length) return
    const srcRate = audioCtx ? audioCtx.sampleRate : 16000
    const merged = new Float32Array(pcmSamples)
    let offset = 0
    for (const b of pcmBuffers) {
      merged.set(b, offset)
      offset += b.length
    }
    pcmBuffers = []
    pcmSamples = 0
    const wavB64 = encodeWavBase64(resampleTo16k(merged, srcRate), 16000)
    onAudioChunk && onAudioChunk(wavB64)
  }

  async function start(video) {
    if (running) return
    videoEl = video
    // 1. 授权并采集（localhost 下浏览器不拦截；非 https 非 localhost 会直接拒绝）
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    video.srcObject = stream
    await video.play().catch(() => {})

    // 2. 帧定时抓取（canvas → JPEG base64）
    canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx2d = canvas.getContext('2d')
    frameTimer = setInterval(() => {
      if (!videoEl || videoEl.readyState < 2) return
      ctx2d.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
      onFrame && onFrame(canvas.toDataURL('image/jpeg', 0.5))
    }, frameInterval)

    // 3. 音频 PCM 采集
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    source = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      if (!running) return
      pcmBuffers.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      pcmSamples += e.inputBuffer.length
    }
    source.connect(processor)
    // 必须连回 destination（音量 0 静音），否则部分浏览器不触发 onaudioprocess
    const mute = audioCtx.createGain()
    mute.gain.value = 0
    processor.connect(mute)
    mute.connect(audioCtx.destination)

    segmentTimer = setInterval(flushAudio, segmentMs)
    running = true
  }

  function stop() {
    running = false
    flushAudio()
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null }
    if (segmentTimer) { clearInterval(segmentTimer); segmentTimer = null }
    try { if (processor) processor.onaudioprocess = null } catch { /* noop */ }
    try { processor && processor.disconnect() } catch { /* noop */ }
    try { source && source.disconnect() } catch { /* noop */ }
    try { audioCtx && audioCtx.close() } catch { /* noop */ }
    audioCtx = null
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }
    if (videoEl) {
      videoEl.srcObject = null
      videoEl = null
    }
    canvas = null
    pcmBuffers = []
    pcmSamples = 0
  }

  return { start, stop, flushAudio }
}
