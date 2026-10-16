// utils/debugStream.js —— 调试台多模态实时推流（契约 4.12）
// 小程序采集：camera 关键帧定时拍取 + 倾诉文本同步上报
// 管理后台通过 WS 实时观察视频帧与多模态分析结果
const config = require("./config");

function post(path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.api(path),
      method: "POST",
      data,
      header: Object.assign({ "Content-Type": "application/json" }, config.authHeader()),
      success: resolve,
      fail: reject,
    });
  });
}

/** 开启推流会话 */
function startSession(conversationId) {
  return post("/mp/debug/stream/start", { conversationId }).then((r) => r.data.data.sessionId);
}

/** 上报音频段（录音文件 base64，后端做 ASR+emotion2vec 分析后广播） */
function sendAudio(sessionId, tempFilePath) {
  return new Promise((resolve) => {
    const fsm = wx.getFileSystemManager();
    fsm.readFile({
      filePath: tempFilePath,
      encoding: "base64",
      success: (res) => {
        post("/mp/debug/stream/audio-base64", { sessionId, audio: res.data })
          .then((r) => resolve(r && r.data))
          .catch(() => resolve(null));
      },
      fail: () => resolve(null),
    });
  });
}

/** 上报关键帧（camera takePhoto 的 tempImagePath → base64） */
function sendFrame(sessionId, tempImagePath) {
  return new Promise((resolve) => {
    const fsm = wx.getFileSystemManager();
    fsm.readFile({
      filePath: tempImagePath,
      encoding: "base64",
      success: (res) => {
        post("/mp/debug/stream/frame", { sessionId, frame: res.data })
          .then(resolve)
          .catch(() => resolve());
      },
      fail: () => resolve(),
    });
  });
}

/** 上报一句完整文本（触发后端判定链 + 数字人回复） */
function sendText(sessionId, text) {
  return post("/mp/debug/stream/text", { sessionId, text }).then((r) => r.data.data);
}

/** 结束推流会话 */
function endSession(sessionId) {
  return post("/mp/debug/stream/end", { sessionId }).catch(() => null);
}

module.exports = { startSession, sendFrame, sendText, sendAudio, endSession };
