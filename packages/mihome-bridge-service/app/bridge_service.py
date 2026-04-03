from __future__ import annotations

import base64
import io
import json
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any, Literal
from urllib import parse

import requests
from mijiaAPI import APIError, LoginError, mijiaAPI, mijiaDevice
from pydantic import TypeAdapter
from qrcode import QRCode

from .models import (
    CloudControlResponse,
    CloudDeviceDto,
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
DEVICE_ICON_CACHE_TTL = timedelta(days=7)
DEVICE_ICON_PAGE_URL = 'https://home.miot-spec.com/s/{model}'


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
        settings.device_icon_cache_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._login_tasks: dict[str, LoginTask] = {}
        self._capability_probe_cache: dict[str, dict[str, Any]] = {}

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
        homes: list[HomeDto] = []

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
        room_membership_map = self._build_room_membership_map(api, home_id)
        room_map = {room.id: room.name for room in self.get_rooms(home_id)}
        raw_devices = api.get_devices_list(home_id)
        devices: list[CloudDeviceDto] = []

        for raw_device in raw_devices:
            did = raw_device.get('did')
            if did is None:
                continue

            membership = room_membership_map.get(str(did))
            room_id = membership['roomId'] if membership is not None else raw_device.get('room_id') or raw_device.get('roomId')

            capability = self._probe_cloud_capability(api, raw_device)
            devices.append(
                CloudDeviceDto(
                    did=str(did),
                    name=str(raw_device.get('name') or raw_device.get('device_name') or '(unnamed-device)'),
                    model=str(raw_device.get('model') or '-'),
                    iconUrl=self._resolve_device_icon_url(raw_device),
                    homeId=str(raw_device.get('home_id') or raw_device.get('homeId') or ''),
                    roomId=str(room_id) if room_id is not None else None,
                    roomName=(
                        membership['roomName']
                        if membership is not None
                        else room_map.get(str(room_id)) if room_id is not None else None
                    ),
                    online=self._to_bool(raw_device.get('isOnline', raw_device.get('online'))),
                    specType=str(raw_device.get('spec_type')) if raw_device.get('spec_type') else None,
                    supportsCloudControl=bool(capability['supportsCloudControl']),
                    supportedActions=list(capability['supportedActions']),
                    capabilityMessage=capability.get('capabilityMessage'),
                    raw=dict(raw_device),
                )
            )

        return devices

    def _build_room_membership_map(
        self, api: mijiaAPI, home_id: str | None = None
    ) -> dict[str, dict[str, str]]:
        membership_map: dict[str, dict[str, str]] = {}

        for home in api.get_homes_list():
            current_home_id = str(home.get('id', ''))
            if home_id is not None and current_home_id != home_id:
                continue

            for room in home.get('roomlist', []) or []:
                room_id = room.get('id') or room.get('room_id')
                if room_id is None:
                    continue

                room_name = str(room.get('name') or room.get('room_name') or '(unnamed-room)')
                for did in room.get('dids', []) or []:
                    membership_map[str(did)] = {
                        'roomId': str(room_id),
                        'roomName': room_name,
                    }

        return membership_map

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

            if self._is_socket_device(device.model):
                status.deviceClass = 'socket'
                status.currentPowerW = self._read_socket_power(device)

            if self._is_air_purifier(device.model):
                status.deviceClass = 'airPurifier'
                status.mode = self._read_air_purifier_mode(device)
                status.temperature = self._read_numeric_prop(device, 'temperature', float)
                humidity = self._read_numeric_prop(device, 'relative-humidity', int)
                status.humidity = int(humidity) if humidity is not None else None
                air_quality_code = self._read_numeric_prop(device, 'air-quality', int)
                status.airQualityCode = int(air_quality_code) if air_quality_code is not None else None
                status.airQualityLabel = self._resolve_air_quality_label(device, status.airQualityCode)
                pm25_density = self._read_numeric_prop(device, 'pm2.5-density', int)
                status.pm25Density = int(pm25_density) if pm25_density is not None else None
        except (ValueError, APIError) as error:
            status.message = str(error)

        return status

    def control_device(self, device_id: str, action: str) -> CloudControlResponse:
        api = self._require_session()
        raw_device = self._find_raw_device(api, device_id)
        device = mijiaDevice(api, did=str(raw_device['did']))

        if action in {'turnOn', 'turnOff', 'toggle'} and 'on' not in device.prop_list:
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
        elif action == 'setModeAuto':
            if 'mode' not in device.prop_list:
                raise ValueError('Device does not expose mode property.')
            device.set('mode', 0)
            target_power = None
        elif action == 'setModeSleep':
            if 'mode' not in device.prop_list:
                raise ValueError('Device does not expose mode property.')
            device.set('mode', 1)
            target_power = None
        elif action == 'setModeFavorite':
            if 'mode' not in device.prop_list:
                raise ValueError('Device does not expose mode property.')
            device.set('mode', 2)
            target_power = None
        else:
            raise ValueError(f'Unsupported action: {action}')

        if target_power is not None:
            device.set('on', target_power)
        updated_status = self.get_device_status(device_id)
        return CloudControlResponse(
            deviceId=device_id,
            success=True,
            message='云端控制指令已下发。',
            updatedStatus=updated_status,
        )

    def _resolve_device_icon_url(self, raw_device: dict[str, Any]) -> str | None:
        model = str(raw_device.get('model') or '').strip()
        if not model or model == '-':
            return None

        cached = self._read_device_icon_cache(model)
        if cached is not None:
            return cached.get('iconUrl') or None

        try:
            icon_url = self._fetch_device_icon_url(model)
        except Exception:
            icon_url = None
        self._write_device_icon_cache(model, icon_url)
        return icon_url

    def _read_device_icon_cache(self, model: str) -> dict[str, Any] | None:
        cache_path = settings.device_icon_cache_dir / f'{self._sanitize_cache_key(model)}.json'
        if not cache_path.exists():
            return None

        try:
            payload = json.loads(cache_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

        expires_at = payload.get('expiresAt')
        if not expires_at or not self._is_future_iso(str(expires_at)):
            return None

        return payload

    def _write_device_icon_cache(self, model: str, icon_url: str | None) -> None:
        cache_path = settings.device_icon_cache_dir / f'{self._sanitize_cache_key(model)}.json'
        now = datetime.now(UTC)
        payload = {
            'model': model,
            'iconUrl': icon_url,
            'fetchedAt': now.isoformat(),
            'expiresAt': (now + DEVICE_ICON_CACHE_TTL).isoformat(),
        }
        cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    def _fetch_device_icon_url(self, model: str) -> str | None:
        response = requests.get(
            DEVICE_ICON_PAGE_URL.format(model=parse.quote(model, safe='')),
            headers={'User-Agent': 'Mozilla/5.0'},
            timeout=20,
        )
        response.raise_for_status()

        payload = self._extract_data_page(response.text)
        entries = payload.get('props', {}).get('list', [])
        if not isinstance(entries, list):
            return None

        exact_match = next(
            (
                item
                for item in entries
                if isinstance(item, dict) and str(item.get('model') or '').strip() == model
            ),
            None,
        )
        if exact_match is not None:
            return self._extract_icon_url(exact_match)

        fallback_entry = next((item for item in entries if isinstance(item, dict)), None)
        if fallback_entry is not None:
            return self._extract_icon_url(fallback_entry)

        return None

    @staticmethod
    def _extract_data_page(html: str) -> dict[str, Any]:
        marker = 'data-page="'
        start = html.find(marker)
        if start < 0:
            return {}

        start += len(marker)
        end = html.find('">', start)
        if end < 0:
            return {}

        try:
            return json.loads(unescape(html[start:end]))
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _extract_icon_url(entry: dict[str, Any]) -> str | None:
        icon_url = entry.get('icon_real')
        if isinstance(icon_url, str) and icon_url.strip():
            return icon_url.strip()
        return None

    @staticmethod
    def _sanitize_cache_key(value: str) -> str:
        return ''.join(char if char.isalnum() or char in '._-' else '_' for char in value)

    @staticmethod
    def _is_future_iso(value: str) -> bool:
        try:
            expires_at = datetime.fromisoformat(value)
        except ValueError:
            return False

        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)

        return expires_at > datetime.now(UTC)

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

    def _probe_cloud_capability(self, api: mijiaAPI, raw_device: dict[str, Any]) -> dict[str, Any]:
        model_key = str(raw_device.get('model') or '')
        cached_capability = self._capability_probe_cache.get(model_key)
        if cached_capability is not None:
            return dict(cached_capability)

        capability = {
            'supportsCloudControl': False,
            'supportedActions': [],
            'capabilityMessage': '未探测到统一开关控制能力。',
        }

        did = raw_device.get('did')
        if did is None:
            capability['capabilityMessage'] = '设备缺少 did，无法进行能力探测。'
            return capability

        try:
            device = mijiaDevice(api, did=str(did))
            on_prop = device.prop_list.get('on')
            mode_prop = device.prop_list.get('mode')

            if on_prop and 'w' in on_prop.rw:
                capability['supportsCloudControl'] = True
                capability['supportedActions'] = ['turnOn', 'turnOff', 'toggle']
                capability['capabilityMessage'] = '已探测到可写 on 属性。'
            elif on_prop:
                capability['capabilityMessage'] = '已探测到 on 属性，但当前未开放写入权限。'
            else:
                capability['capabilityMessage'] = '未探测到可统一控制的 on 属性。'

            if self._is_air_purifier(device.model) and mode_prop and 'w' in mode_prop.rw:
                capability['supportsCloudControl'] = True
                capability['supportedActions'] = [
                    *capability['supportedActions'],
                    'setModeAuto',
                    'setModeSleep',
                    'setModeFavorite',
                ]
                if on_prop and 'w' in on_prop.rw:
                    capability['capabilityMessage'] = '已探测到净化器开关与模式控制能力。'
                else:
                    capability['capabilityMessage'] = '已探测到净化器模式控制能力。'
        except Exception as error:  # pragma: no cover - third-party runtime guard
            capability['capabilityMessage'] = f'能力探测失败: {error}'

        self._capability_probe_cache[model_key] = dict(capability)
        return capability

    @staticmethod
    def _is_air_purifier(model: str | None) -> bool:
        normalized = str(model or '').lower()
        return normalized.startswith('zhimi.air')

    @staticmethod
    def _is_socket_device(model: str | None) -> bool:
        normalized = str(model or '').lower()
        return any(keyword in normalized for keyword in ('plug', 'outlet', 'socket', 'cuco.'))

    @staticmethod
    def _read_numeric_prop(
        device: mijiaDevice, prop_name: str, value_type: type[int] | type[float]
    ) -> int | float | None:
        if prop_name not in device.prop_list:
            return None

        value = device.get(prop_name)
        if value is None:
            return None

        try:
            return value_type(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _read_first_numeric_prop(
        cls,
        device: mijiaDevice,
        prop_names: list[str],
        value_type: type[int] | type[float],
    ) -> int | float | None:
        for prop_name in prop_names:
            value = cls._read_numeric_prop(device, prop_name, value_type)
            if value is not None:
                return value

        return None

    @classmethod
    def _read_socket_power(cls, device: mijiaDevice) -> float | None:
        value = cls._read_first_numeric_prop(
            device,
            ['electric-power', 'power-value', 'power'],
            float,
        )
        if value is None or value < 0:
            return None

        return value

    @staticmethod
    def _read_air_purifier_mode(device: mijiaDevice) -> Literal['auto', 'sleep', 'favorite'] | None:
        if 'mode' not in device.prop_list:
            return None

        try:
            mode_value = int(device.get('mode'))
        except (TypeError, ValueError):
            return None

        if mode_value == 0:
            return 'auto'
        if mode_value == 1:
            return 'sleep'
        if mode_value == 2:
            return 'favorite'
        return None

    @staticmethod
    def _resolve_air_quality_label(device: mijiaDevice, value: int | None) -> str | None:
        if value is None:
            return None

        prop = device.prop_list.get('air-quality')
        if prop is None or not prop.value_list:
            return None

        for item in prop.value_list:
            if item.get('value') == value:
                return str(item.get('desc_zh_cn') or item.get('description') or '').strip() or None

        return None

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
