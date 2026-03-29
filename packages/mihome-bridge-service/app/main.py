from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from mijiaAPI import APIError, LoginError

from .bridge_service import MiHomeBridgeService
from .models import (
    CloudControlRequest,
    CloudControlResponse,
    DeviceStatusResponse,
    HealthResponse,
    LoginPollResponse,
    PollQrLoginRequest,
    QrLoginTicket,
    SessionSnapshot,
    StartQrLoginRequest,
    SyncResponse,
)

app = FastAPI(title='MiHome Bridge Service', version='0.1.0')
service = MiHomeBridgeService()


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.get('/api/auth/session', response_model=SessionSnapshot)
def get_session() -> SessionSnapshot:
    return service.get_session()


@app.post('/api/auth/login/start', response_model=QrLoginTicket)
def start_qr_login(payload: StartQrLoginRequest) -> QrLoginTicket:
    try:
        return service.start_qr_login(payload.region)
    except LoginError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post('/api/auth/login/poll', response_model=LoginPollResponse)
def poll_qr_login(payload: PollQrLoginRequest) -> LoginPollResponse:
    try:
        return service.poll_qr_login(payload.ticketId)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post('/api/auth/logout')
def logout() -> dict[str, bool]:
    return service.logout()


@app.get('/api/cloud/homes')
def get_homes():
    try:
        return service.get_homes()
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get('/api/cloud/rooms')
def get_rooms(homeId: str | None = Query(default=None)):
    try:
        return service.get_rooms(homeId)
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get('/api/cloud/devices')
def get_devices(homeId: str | None = Query(default=None)):
    try:
        return service.get_devices(homeId)
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get('/api/cloud/sync', response_model=SyncResponse)
def sync() -> SyncResponse:
    try:
        return service.sync()
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get('/api/cloud/status', response_model=DeviceStatusResponse)
def get_device_status(deviceId: str = Query(min_length=1)):
    try:
        return service.get_device_status(deviceId)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post('/api/cloud/control', response_model=CloudControlResponse)
def control_device(payload: CloudControlRequest) -> CloudControlResponse:
    try:
        return service.control_device(payload.deviceId, payload.action)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (LoginError, APIError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
