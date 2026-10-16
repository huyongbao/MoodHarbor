"""统一响应与业务异常 —— PRD 8.1：HTTP 状态码与 body code 语义一一对应"""
from fastapi.responses import JSONResponse


def ok(data=None, message="success"):
    """成功：HTTP 200 + code 0"""
    return {"code": 0, "message": message, "data": data}


class BizError(Exception):
    """业务异常：抛出后由全局 handler 转成 {code, message}（与 HTTP 同码）"""

    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def install_exception_handlers(app):
    """全局异常处理：BizError → JSONResponse(code, message)，HTTP 状态与 code 一致"""

    @app.exception_handler(BizError)
    async def biz_error_handler(request, exc: BizError):
        status = exc.code if exc.code in (400, 401, 403, 404, 500) else 400
        return JSONResponse(
            status_code=status,
            content={"code": exc.code, "message": exc.message, "data": None},
        )
