from __future__ import annotations

import base64
import io
import json
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib import parse

import requests
from mijiaAPI import APIError, LoginError, mijiaAPI, mijiaDevice
from pydantic import TypeAdapter
from qrcode import QRCode

from .models import (
    CloudDeviceDto,
    CloudControlResponse,
    DeviceStatusResponse,
    HomeDto,
    LoginPollResponse,
    LoginStatus,
    QrLoginTicket,
    RoomDto,
    SessionSnapshot,
    SyncResponse,
)
from .settings import settings

UTC = timezone.utc
REGION = Literal['cn', 'de', 'us']
SESSION_META_ADAPTER = TypeAdapter(dict[str, str])
AUTH_KEYS = ['psecurity', 'nonce', 'ssecurity', 'passToken', 'userId', 'cUserId']


@dataclass
class LoginTask:
    ticket_id: str
    region: str
    status: LoginStatus
    qr_code_data: str
    expires_at: str
    created_at: str
    qr_login_url: str | None = None
    error_message: str | None = None
    session: SessionSnapshot | None = None


class MiHomeBridgeService:
    def __init__(self) -> None:
        settings.runtime_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._login_tasks: dict[str, LoginTask] = {}

    def get_session(self) -> SessionSnapshot:
        api = self._create_api()
        meta = self._read_session_meta()
        region = self._normalize_region(meta.get('region', 'cn'))

        if not api.available:
            return SessionSnapshot(
                status='idle',
                region=region,
                authStoragePath=str(settings.auth_path),
                accountId=meta.get('accountId'),
                lastLoginAt=meta.get('lastLoginAt'),
            )

        return SessionSnapshot(
            status='success',
            region=region,
            authStoragePath=str(settings.auth_path),
            accountId=str(api.auth_data.get('userId', meta.get('accountId') or '')) or None,
            lastLoginAt=meta.get('lastLoginAt'),
        )

    def start_qr_login(self, region: REGION) -> QrLoginTicket:
        api = self._create_api()

        if api.available:
            snapshot = self._build_session_snapshot(api, region)
            task = self._create_task(region=region, status='success', qr_code_data='', session=snapshot)
            return self._to_ticket(task)

        prepared = self._prepare_qr_login(api, region)
        if prepared['type'] == 'success':
            snapshot = self._build_session_snapshot(api, region)
            task = self._create_task(region=region, status='success', qr_code_data='', session=snapshot)
            return self._to_ticket(task)

        qr_code_data = self._build_qr_data_url(prepared['login_url'])
        task = self._create_task(
            region=region,
            status='pending',
            qr_code_data=qr_code_data,
            qr_login_url=prepared['login_url'],
        )

        worker = threading.Thread(
            target=self._complete_qr_login,
            kwargs={
                'ticket_id': task.ticket_id,
                'api': api,
                'region': region,
                'lp_url': prepared['lp_url'],
                'headers': prepared['headers'],
            },
            daemon=True,
        )
        worker.start()
        return self._to_ticket(task)

    def poll_qr_login(self, ticket_id: str) -> LoginPollResponse:
        with self._lock:
            task = self._login_tasks.get(ticket_id)
            if task is None:
                raise KeyError(f'Login ticket not found: {ticket_id}')

            if task.status == 'pending' and self._is_expired(task.expires_at):
                task.status = 'expired'
                task.error_message = 'QR login ticket expired.'

            return LoginPollResponse(
                ticketId=task.ticket_id,
                status=task.status,
                expiresAt=task.expires_at,
                session=task.session,
                errorMessage=task.error_message,
            )

    def logout(self) -> dict[str, bool]:
        if settings.auth_path.exists():
            settings.auth_path.unlink()
        if settings.meta_path.exists():
            settings.meta_path.unlink()
        return {'success': True}

    def get_homes(self) -> list[HomeDto]:
        api = self._require_session()
        homes = []
        for home in api.get_homes_list():
            homes.append(
                HomeDto(
                    id=str(home.get('id', '')),
                    name=str(home.get('name') or home.get('home_name') or '(unnamed-home)'),
                    uid=str(home.get('uid')) if home.get('uid') is not None else None,
                )
            )
        return homes

    def get_rooms(self, home_id: str | None = None) -> list[RoomDto]:
        api = self._require_session()
        rooms: list[RoomDto] = []

        for home in api.get_homes_list():
            current_home_id = str(home.get('id', ''))
            if home_id is not None and current_home_id != home_id:
                continue

            for room in home.get('roomlist', []) or []:
                room_id = room.get('id') or room.get('room_id')
                if room_id is None:
                    continue
                rooms.append(
                    RoomDto(
                        id=str(room_id),
                        homeId=current_home_id,
                        name=str(room.get('name') or room.get('room_name') or '(unnamed-room)'),
                    )
                )

        return rooms

    def get_devices(self, home_id: str | None = None) -> list[CloudDeviceDto]:
        api = self._require_session()
        room_map = {
            room.id: room.name
            for room in self.get_rooms(home_id)
        }
        raw_devices = api.get_devices_list(home_id)
        devices: list[CloudDeviceDto] = []

        for raw_device in raw_devices:
            room_id = raw_device.get('room_id') or raw_device.get('roomId')
            did = raw_device.get('did')
            if did is None:
                continue
            devices.append(
                CloudDeviceDto(
                    did=str(did),
                    name=str(raw_device.get('name') or raw_device.get('device_name') or '(unnamed-device)'),
                    model=str(raw_device.get('model') or '-'),
                    homeId=str(raw_device.get('home_id') or raw_device.get('homeId') or ''),
                    roomId=str(room_id) if room_id is not None else None,
                    roomName=room_map.get(str(room_id)) if room_id is not None else None,
                    online=self._to_bool(raw_device.get('isOnline', raw_device.get('online'))),
                    specType=str(raw_device.get('spec_type')) if raw_device.get('spec_type') else None,
                    raw=dict(raw_device),
                )
            )

        return devices

    def sync(self) -> SyncResponse:
        homes = self.get_homes()
        all_rooms: list[RoomDto] = []
        all_devices: list[CloudDeviceDto] = []

        for home in homes:
            all_rooms.extend(self.get_rooms(home.id))
            all_devices.extend(self.get_devices(home.id))

        return SyncResponse(
            homes=homes,
            rooms=all_rooms,
            devices=all_devices,
            syncedAt=self._now_iso(),
        )

    def get_device_status(self, device_id: str) -> DeviceStatusResponse:
        api = self._require_session()
        raw_device = self._find_raw_device(api, device_id)
        status = DeviceStatusResponse(
            deviceId=str(raw_device['did']),
            online=self._to_bool(raw_device.get('isOnline', raw_device.get('online'))) or False,
            updatedAt=self._now_iso(),
            raw=self._build_status_raw(raw_device),
        )

        try:
            device = mijiaDevice(api, did=str(raw_device['did']))
            if 'on' in device.prop_list:
                status.power = bool(device.get('on'))
            else:
                status.message = '当前设备未暴露 on 属性，暂不支持统一开关状态读取。'
        except (ValueError, APIError) as error:
            status.message = str(error)

        return status

    def control_device(self, device_id: str, action: str) -> CloudControlResponse:
        api = self._require_session()
        raw_device = self._find_raw_device(api, device_id)
        device = mijiaDevice(api, did=str(raw_device['did']))

        if 'on' not in device.prop_list:
            return CloudControlResponse(
                deviceId=device_id,
                success=False,
                message='当前设备未暴露 on 属性，暂不支持统一开关控制。',
            )

        if action == 'turnOn':
            target_power = True
        elif action == 'turnOff':
            target_power = False
        elif action == 'toggle':
            target_power = not bool(device.get('on'))
        else:
            raise ValueError(f'Unsupported action: {action}')

        device.set('on', target_power)
        updated_status = self.get_device_status(device_id)
        return CloudControlResponse(
            deviceId=device_id,
            success=True,
            message='云端控制指令已下发。',
            updatedStatus=updated_status,
        )

    def _create_api(self) -> mijiaAPI:
        return mijiaAPI(str(settings.auth_path))

    def _require_session(self) -> mijiaAPI:
        api = self._create_api()
        if not api.available:
            raise LoginError(-1, 'Session missing or expired. Please login first.')
        return api

    def _prepare_qr_login(self, api: mijiaAPI, region: REGION) -> dict[str, Any]:
        location_data = api._get_location()
        if location_data.get('code') == 0 and location_data.get('message') == '刷新Token成功':
            api._save_auth_data()
            api._init_session()
            self._write_session_meta(region, api.auth_data.get('userId'))
            return {'type': 'success'}

        location_data.update(
            {
                'theme': '',
                'bizDeviceType': '',
                '_hasLogo': 'false',
                '_qrsize': '240',
                '_dc': str(int(time.time() * 1000)),
            }
        )
        login_endpoint = api.login_url + '?' + parse.urlencode(location_data)
        headers = {
            'User-Agent': api.user_agent,
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Connection': 'keep-alive',
        }
        login_response = requests.get(login_endpoint, headers=headers, timeout=30)
        login_data = api._handle_ret(login_response)
        return {
            'type': 'pending',
            'lp_url': login_data['lp'],
            'login_url': login_data['loginUrl'],
            'headers': headers,
        }

    def _complete_qr_login(
        self,
        ticket_id: str,
        api: mijiaAPI,
        region: REGION,
        lp_url: str,
        headers: dict[str, str],
    ) -> None:
        session = requests.Session()

        try:
            long_poll_response = session.get(lp_url, headers=headers, timeout=120)
            long_poll_data = api._handle_ret(long_poll_response)

            for auth_key in AUTH_KEYS:
                api.auth_data[auth_key] = long_poll_data[auth_key]

            callback_url = long_poll_data['location']
            session.get(callback_url, headers=headers, timeout=30)
            api.auth_data.update(session.cookies.get_dict())
            api.auth_data.update(
                {
                    'expireTime': int(
                        (datetime.now(UTC) + timedelta(days=30)).timestamp() * 1000
                    )
                }
            )
            api._save_auth_data()
            api._init_session()
            self._write_session_meta(region, api.auth_data.get('userId'))
            snapshot = self._build_session_snapshot(api, region)
            self._update_task(ticket_id, status='success', session=snapshot)
        except requests.exceptions.Timeout:
            self._update_task(ticket_id, status='expired', error_message='QR login timed out.')
        except Exception as error:
            self._update_task(ticket_id, status='failed', error_message=str(error))

    def _build_session_snapshot(self, api: mijiaAPI, region: REGION) -> SessionSnapshot:
        meta = self._read_session_meta()
        last_login_at = meta.get('lastLoginAt') or self._now_iso()
        self._write_session_meta(region, api.auth_data.get('userId'), last_login_at)
        return SessionSnapshot(
            status='success',
            accountId=str(api.auth_data.get('userId', '')) or None,
            region=region,
            authStoragePath=str(settings.auth_path),
            lastLoginAt=last_login_at,
        )

    def _create_task(
        self,
        region: REGION,
        status: LoginStatus,
        qr_code_data: str,
        session: SessionSnapshot | None = None,
        qr_login_url: str | None = None,
    ) -> LoginTask:
        created_at = self._now_iso()
        task = LoginTask(
            ticket_id=self._new_ticket_id(),
            region=region,
            status=status,
            qr_code_data=qr_code_data,
            expires_at=(datetime.now(UTC) + timedelta(seconds=125)).isoformat(),
            created_at=created_at,
            qr_login_url=qr_login_url,
            session=session,
        )
        with self._lock:
            self._login_tasks[task.ticket_id] = task
        return task

    def _update_task(
        self,
        ticket_id: str,
        status: LoginStatus,
        session: SessionSnapshot | None = None,
        error_message: str | None = None,
    ) -> None:
        with self._lock:
            task = self._login_tasks.get(ticket_id)
            if task is None:
                return
            task.status = status
            task.session = session
            task.error_message = error_message

    def _to_ticket(self, task: LoginTask) -> QrLoginTicket:
        return QrLoginTicket(
            ticketId=task.ticket_id,
            qrCodeData=task.qr_code_data,
            expiresAt=task.expires_at,
            status=task.status,
        )

    def _read_session_meta(self) -> dict[str, str]:
        if not settings.meta_path.exists():
            return {}
        try:
            return SESSION_META_ADAPTER.validate_python(
                json.loads(settings.meta_path.read_text(encoding='utf-8'))
            )
        except Exception:
            return {}

    def _write_session_meta(
        self,
        region: REGION,
        account_id: Any,
        last_login_at: str | None = None,
    ) -> None:
        payload = {
            'region': region,
            'accountId': str(account_id or ''),
            'lastLoginAt': last_login_at or self._now_iso(),
        }
        settings.meta_path.parent.mkdir(parents=True, exist_ok=True)
        settings.meta_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

    def _build_qr_data_url(self, login_url: str) -> str:
        qr = QRCode(border=1, box_size=8)
        qr.add_data(login_url)
        image = qr.make_image(fill_color='black', back_color='white')
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
        return f'data:image/png;base64,{encoded}'

    def _normalize_region(self, region: str) -> REGION:
        if region in {'cn', 'de', 'us'}:
            return region
        return 'cn'

    def _find_raw_device(self, api: mijiaAPI, device_id: str) -> dict[str, Any]:
        for device in api.get_devices_list():
            if str(device.get('did')) == device_id:
                return dict(device)

        raise APIError(-1, f'Device not found: {device_id}')

    def _build_status_raw(self, raw_device: dict[str, Any]) -> dict[str, Any]:
        raw_snapshot: dict[str, Any] = {
            'name': raw_device.get('name'),
            'model': raw_device.get('model'),
            'specType': raw_device.get('spec_type'),
        }

        if raw_device.get('home_id') is not None:
            raw_snapshot['homeId'] = str(raw_device.get('home_id'))

        if raw_device.get('room_id') is not None:
            raw_snapshot['roomId'] = str(raw_device.get('room_id'))

        return raw_snapshot

    def _new_ticket_id(self) -> str:
        return f'login-{int(time.time() * 1000)}'

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat()

    def _is_expired(self, expires_at: str) -> bool:
        return datetime.now(UTC) >= datetime.fromisoformat(expires_at)

    def _to_bool(self, value: Any) -> bool | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            lowered = value.lower()
            if lowered in {'true', '1', 'online'}:
                return True
            if lowered in {'false', '0', 'offline'}:
                return False
        return None
