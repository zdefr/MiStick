from __future__ import annotations

import os

import uvicorn
import uvicorn.lifespan.on  # Ensures PyInstaller picks up uvicorn's dynamic lifespan loader.
import uvicorn.loops.asyncio  # Ensures PyInstaller picks up uvicorn's asyncio loop setup.
from uvicorn.protocols.http.h11_impl import H11Protocol

from app.main import app


def main() -> None:
    host = os.environ.get("MIHOME_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("MIHOME_BRIDGE_PORT", "8790"))
    log_level = os.environ.get("MIHOME_BRIDGE_LOG_LEVEL", "info")

    uvicorn.run(
        app,
        host=host,
        port=port,
        loop="asyncio",
        http=H11Protocol,
        ws="none",
        lifespan="on",
        access_log=False,
        log_level=log_level,
    )


if __name__ == "__main__":
    main()
