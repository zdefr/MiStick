# mijia-api Spike Demo

This demo verifies the current project's minimum viable cloud path with `mijiaAPI`:

1. Sign in with the Mijia app by scanning a QR code
2. Save auth data inside the demo directory
3. Fetch homes
4. Fetch devices
5. Optionally turn on a named device such as `锦鲤缸`

## Scope

This is a spike only. It does not include Electron, IPC, or UI integration.

## Prerequisites

- Python `3.9+`
- Mijia app installed on your phone
- A valid Mijia account that can scan the login QR code

## Install

```bash
cd demo/mijia-api-spike
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

macOS / Linux:

```bash
./.venv/bin/python -m pip install -r requirements.txt
```

## Run

Login and sync only:

```bash
python spike.py
```

Login, sync, then try to turn on `锦鲤缸`:

```bash
python spike.py --turn-on-device
```

Login, sync, then try to turn on another named device:

```bash
python spike.py --turn-on-device --device-name "客厅台灯"
```

On Windows PowerShell, you can also run without activating the venv:

```powershell
.\.venv\Scripts\python.exe spike.py --turn-on-device
```

## Runtime files

The demo writes runtime artifacts here:

```text
demo/mijia-api-spike/.runtime/auth.json
demo/mijia-api-spike/.runtime/last-sync.json
```

These files are ignored by `.gitignore`.

## Expected behavior

Successful execution prints:

- Auth file path
- Home summary
- Device summary
- Optional control result for the target device

If `--turn-on-device` is enabled, the script will:

1. Find the target device by `dev_name`
2. Try to set the `on` property to `True`
3. Print success or the failure reason

## Notes

- `auth.json` contains sensitive auth data and should never be committed.
- This demo depends on the community library `mijiaAPI`, not an official Xiaomi SDK.
- `mijiaAPI` uses GPL-3.0. License impact still needs separate evaluation before product adoption.

## References

- `mijiaAPI` repo: <https://github.com/Do1e/mijia-api>
- `mijiaAPI` FAQ: <https://github.com/Do1e/mijia-api/blob/main/FAQ.md>
