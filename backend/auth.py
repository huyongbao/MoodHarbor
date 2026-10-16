"""JWT 鉴权 —— PRD 8.1：Authorization: Bearer <token>"""
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from common import BizError
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from database import get_db
from models.entities import User, AdminAccount, Role


def create_token(payload: dict, hours: int = JWT_EXPIRE_HOURS) -> str:
    payload = dict(payload)
    payload["exp"] = datetime.utcnow() + timedelta(hours=hours)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def parse_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise BizError(401, "Token 已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise BizError(401, "无效 Token")


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    """小程序端用户鉴权依赖"""
    if not authorization.startswith("Bearer "):
        raise BizError(401, "未登录")
    payload = parse_token(authorization[7:])
    user = db.query(User).filter(User.id == payload.get("uid")).first()
    if not user:
        raise BizError(401, "用户不存在")
    return user


def get_current_admin(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict:
    """管理端鉴权依赖，返回 {admin, role}"""
    if not authorization.startswith("Bearer "):
        raise BizError(401, "未登录")
    payload = parse_token(authorization[7:])
    admin = db.query(AdminAccount).filter(AdminAccount.id == payload.get("aid")).first()
    if not admin or admin.status != 1:
        raise BizError(401, "账号不可用")
    role = db.query(Role).filter(Role.id == admin.role_id).first()
    return {"admin": admin, "role": role}


def require_super_admin(auth: dict = Depends(get_current_admin)) -> dict:
    """仅超管（role_id=1）"""
    if not auth["role"] or auth["role"].id != 1:
        raise BizError(403, "无权限")
    return auth
