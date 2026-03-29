from __future__ import annotations

import os
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        package_dir = Path(__file__).resolve().parent.parent
        runtime_dir = Path(
            os.environ.get('MIHOME_BRIDGE_RUNTIME_DIR', package_dir / '.runtime')
        )
        auth_path = Path(
            os.environ.get('MIHOME_BRIDGE_AUTH_PATH', runtime_dir / 'auth.json')
        )

        self.package_dir = package_dir
        self.runtime_dir = runtime_dir
        self.auth_path = auth_path
        self.meta_path = runtime_dir / 'session-meta.json'


settings = Settings()