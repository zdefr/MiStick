from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from mijiaAPI import APIError, LoginError, mijiaAPI, mijiaDevice


RUNTIME_DIR = Path(__file__).resolve().parent / ".runtime"
AUTH_PATH = RUNTIME_DIR / "auth.json"
DEFAULT_DEVICE_NAME = "\u9526\u9ca4\u7f38"


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def format_home_map(homes: list[dict[str, Any]]) -> dict[str, str]:
    home_map: dict[str, str] = {}
    for home in homes:
        home_id = str(home.get("id", ""))
        home_name = home.get("name") or home.get("home_name") or "(unnamed-home)"
        if home_id:
            home_map[home_id] = str(home_name)
    return home_map


def print_homes(homes: list[dict[str, Any]]) -> None:
    print(f"Home count: {len(homes)}")
    for index, home in enumerate(homes, start=1):
        home_id = home.get("id", "-")
        home_name = home.get("name") or home.get("home_name") or "(unnamed-home)"
        print(f"[Home {index}] name={home_name} id={home_id}")


def print_devices(
    devices: list[dict[str, Any]],
    home_map: dict[str, str],
    limit: int = 20,
) -> None:
    print(f"Device count: {len(devices)}")
    for index, device in enumerate(devices[:limit], start=1):
        did = device.get("did", "-")
        name = device.get("name") or device.get("device_name") or "(unnamed-device)"
        model = device.get("model", "-")
        home_id = str(device.get("home_id") or device.get("homeId") or "")
        home_name = home_map.get(home_id, "-")
        print(
            f"[Device {index}] name={name} model={model} home={home_name} did={did}"
        )

    if len(devices) > limit:
        print(f"... omitted {len(devices) - limit} more devices")


def dump_debug_snapshot(
    homes: list[dict[str, Any]],
    devices: list[dict[str, Any]],
) -> Path:
    snapshot_path = RUNTIME_DIR / "last-sync.json"
    snapshot = {
        "homes": homes,
        "devices": devices,
    }
    snapshot_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return snapshot_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Minimal spike demo for login, sync, and optional device control.",
    )
    parser.add_argument(
        "--turn-on-device",
        action="store_true",
        help="Attempt to set the target device 'on' property to True.",
    )
    parser.add_argument(
        "--device-name",
        default=DEFAULT_DEVICE_NAME,
        help=f"Target device name for control. Default: {DEFAULT_DEVICE_NAME}",
    )
    return parser.parse_args()


def turn_on_device(api: mijiaAPI, device_name: str) -> bool:
    print()
    print(f"Attempting to turn on device: {device_name}")
    try:
        device = mijiaDevice(api, dev_name=device_name)
        device.set("on", True)
        print(f"Device control succeeded: {device_name} is requested to turn on.")
        return True
    except ValueError as exc:
        print(f"Device control failed due to unsupported property or value: {exc}")
        return False
    except APIError as exc:
        print(f"Device control failed due to cloud API error: {exc}")
        return False
    except Exception as exc:  # pragma: no cover - third-party runtime guard
        print(f"Device control failed: {exc}")
        return False


def main() -> int:
    args = parse_args()
    ensure_runtime_dir()

    print("== mijia-api spike demo ==")
    print(f"Auth file: {AUTH_PATH}")

    api = mijiaAPI(str(AUTH_PATH))

    try:
        print("Checking login. The first run will print a QR code in the terminal.")
        print("Please scan it with the Mijia app...")
        api.login()
        print("Login completed.")
    except LoginError as exc:
        print(f"Login failed: {exc}")
        return 1

    try:
        homes = api.get_homes_list()
        devices = api.get_devices_list()
    except APIError as exc:
        print(f"Cloud API call failed: {exc}")
        return 1
    except Exception as exc:  # pragma: no cover - third-party runtime guard
        print(f"Unexpected error: {exc}")
        return 1

    print()
    print_homes(homes)
    print()

    home_map = format_home_map(homes)
    print_devices(devices, home_map)
    print()

    snapshot_path = dump_debug_snapshot(homes, devices)
    print(f"Sync snapshot written to: {snapshot_path}")

    if args.turn_on_device:
        turn_on_device(api, args.device_name)

    print("Spike validation completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
