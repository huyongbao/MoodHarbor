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

# ---- 风险分级（PRD 9.2）----
RISK_CONFIDENCE_THRESHOLD = 0.8  # 模型置信度 ≥ 0.8 直接采信

# ---- 上传 ----
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB
