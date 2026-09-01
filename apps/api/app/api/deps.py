from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def require_receptionist(
    x_receptionist_token: str | None = Header(default=None),
) -> None:
    if x_receptionist_token != get_settings().RECEPTIONIST_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Receptionist token required",
        )


def require_admin(
    x_admin_password: str | None = Header(default=None),
) -> None:
    if x_admin_password != get_settings().ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin password required",
        )
