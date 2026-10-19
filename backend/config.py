"""全局配置 —— 歇会儿后端
配置加载优先级：进程环境变量 > backend/.env 文件 > 内置默认值
（.env 已在 .gitignore 排除，密钥不进代码库；模板见 .env.example）
"""
import os

# 自动加载 backend/.env（存在则读，不存在走默认值）
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass  # 无 python-dotenv 时仅用进程环境变量

# ---- 应用 ----
APP_NAME = "歇会儿 API"
VERSION = "0.1.0"
# SQLite 单文件起步（PRD V6.1），后期迁移 MySQL 仅改连接串
# 绝对路径：无论从哪个 cwd 启动，库文件位置一致
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///" + os.path.join(os.path.dirname(os.path.abspath(__file__)), "moodharbor.db"),
)

# ---- JWT ----
JWT_SECRET = os.getenv("JWT_SECRET", "moodharbor-dev-secret-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

# ---- 微信小程序（code2Session）----
# 开发阶段无后端回调域名时，WX_LOGIN_MOCK=true 直接用 code 当 openid
WX_LOGIN_MOCK = os.getenv("WX_LOGIN_MOCK", "true").lower() == "true"
WX_APPID = os.getenv("WX_APPID", "wx96266f6a77bb3c94")
WX_SECRET = os.getenv("WX_SECRET", "")

# ---- LLM（DeepSeek 官方 API，后续可替换 EmoLLM，业务代码零改动）----
# deepseek-flash：V4.1-Flash，支持图文输入，延迟约 1.2s（数字人对话默认）
# deepseek-v4-pro：V4-Pro，纯文本，延迟约 4s，风险判级更谨慎
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")  # 从环境变量读取，不进代码库
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-flash")

# ---- 魔珐星云 3D 数字人（web-view H5 宿主页，双数字人）----
# 小满（女，dh_01）
DH_APP_ID_FEMALE = os.getenv("DH_APP_ID_FEMALE", "")
DH_APP_SECRET_FEMALE = os.getenv("DH_APP_SECRET_FEMALE", "")
# 知远（男，dh_02）
DH_APP_ID_MALE = os.getenv("DH_APP_ID_MALE", "")
DH_APP_SECRET_MALE = os.getenv("DH_APP_SECRET_MALE", "")

# 数字人 ID → 星云应用密钥映射（dh_01=小满女 / dh_02=知远男）
DH_CREDENTIALS = {
    "dh_01": (DH_APP_ID_FEMALE, DH_APP_SECRET_FEMALE),
    "dh_02": (DH_APP_ID_MALE, DH_APP_SECRET_MALE),
}

# ---- 对外 HTTPS 地址（cloudflared 隧道，供小程序 web-view 加载 3D 数字人 H5）----
# 关键：该地址由隧道脚本动态写回 .env，**不能只在进程启动时读一次**。
# 否则隧道重启 → 域名变了 → 后端仍返回旧地址 → web-view 打开死链白屏。
# 下面 get_public_base_url() 按 .env 的 mtime 做缓存热读，地址变了无需重启后端。
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")

_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
_pub_url_cache = {"mtime": -1.0, "value": ""}


def get_public_base_url() -> str:
    """热读 .env 里的 PUBLIC_BASE_URL（按文件 mtime 缓存，隧道刷新后自动生效）。

    隧道地址一天可能变好几次（Quick Tunnel 每次重启域名都随机），
    进程启动时固化的话，改完 .env 还得重启后端，演示途中极易遗漏。
    """
    try:
        mt = os.path.getmtime(_ENV_FILE)
    except OSError:
        mt = -1.0
    if mt != _pub_url_cache["mtime"]:
        val = ""
        try:
            with open(_ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("PUBLIC_BASE_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
        except OSError:
            val = ""
        _pub_url_cache["mtime"] = mt
        _pub_url_cache["value"] = val or os.getenv("PUBLIC_BASE_URL", "")
    return _pub_url_cache["value"]


# ---- 风险分级（PRD 9.2）----
RISK_CONFIDENCE_THRESHOLD = 0.8  # 模型置信度 ≥ 0.8 直接采信

# ---- 上传 ----
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB
