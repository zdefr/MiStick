from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

LoginStatus = Literal['idle', 'pending', 'success', 'expired', 'failed']
DeviceControlAction = Literal['toggle', 'turnOn', 'turnOff']


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = 'mihome-bridge-service'


class StartQrLoginRequest(BaseModel):
    region: Literal['cn', 'de', 'us'] = 'cn'


class PollQrLoginRequest(BaseModel):
    ticketId: str = Field(min_length=1)


class SessionSnapshot(BaseModel):
    status: LoginStatus
    accountId: str | None = None
    region: Literal['cn', 'de', 'us'] = 'cn'
    authStoragePath: str
    lastLoginAt: str | None = None
    message: str | None = None


class QrLoginTicket(BaseModel):
    ticketId: str
    qrCodeData: str
    expiresAt: str
    status: LoginStatus = 'pending'


class LoginPollResponse(BaseModel):
    ticketId: str
    status: LoginStatus
    expiresAt: str
    session: SessionSnapshot | None = None
    errorMessage: str | None = None


class HomeDto(BaseModel):
    id: str
    name: str
    uid: str | None = None


class RoomDto(BaseModel):
    id: str
    homeId: str
    name: str


class CloudDeviceDto(BaseModel):
    did: str
    name: str
    model: str
    homeId: str
    roomId: str | None = None
    roomName: str | None = None
    online: bool | None = None
    specType: str | None = None
    supportsCloudControl: bool = False
    supportedActions: list[DeviceControlAction] = Field(default_factory=list)
    capabilityMessage: str | None = None
    raw: dict[str, Any]


class SyncResponse(BaseModel):
    homes: list[HomeDto]
    rooms: list[RoomDto]
    devices: list[CloudDeviceDto]
    syncedAt: str


class CloudControlRequest(BaseModel):
    deviceId: str = Field(min_length=1)
    action: DeviceControlAction


class DeviceStatusResponse(BaseModel):
    deviceId: str
    online: bool
    updatedAt: str
    route: Literal['cloud'] = 'cloud'
    power: bool | None = None
    message: str | None = None
    raw: dict[str, Any] | None = None


class CloudControlResponse(BaseModel):
    deviceId: str
    success: bool
    route: Literal['cloud'] = 'cloud'
    message: str | None = None
    updatedStatus: DeviceStatusResponse | None = None
