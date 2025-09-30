#!/usr/bin/env python3
import sys, json, struct, shutil, subprocess, threading, socket, os, traceback
from typing import Any, List, Optional
from pathlib import Path

LOG = Path("/tmp/rofi_native.log")
def log(msg: str):
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        LOG.write_text((LOG.read_text() if LOG.exists() else "") + msg + "\n", encoding="utf-8")
    except Exception:
        pass

def read_message() -> Optional[dict]:
    try:
        header = sys.stdin.buffer.read(4)
        if not header:
            log("EOF on stdin (Chrome closed pipe)"); return None
        (length,) = struct.unpack('<I', header)
        payload = sys.stdin.buffer.read(length)
        if not payload:
            log("Empty payload"); return None
        return json.loads(payload.decode('utf-8'))
    except Exception as e:
        log("read_message error: " + repr(e))
        return None

def send_message(obj: Any) -> None:
    try:
        data = json.dumps(obj).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('<I', len(data)))
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    except Exception as e:
        log("send_message error: " + repr(e))

def spawn_detached(argv: List[str]) -> None:
    if not argv or not isinstance(argv, list):
        raise ValueError("spawn must be a non-empty list")
    subprocess.Popen(argv,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True)

def write_json(path: str, obj: Any) -> None:
    p = Path(path); tmp = p.with_suffix(p.suffix + '.tmp')
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')
    tmp.replace(p)

# Unix-socket bridge (for focusing tabs via the extension)
def bridge_loop(sock_path: str, send_cb):
    try:
        try: os.unlink(sock_path)
        except FileNotFoundError: pass
        srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        srv.bind(sock_path)
        os.chmod(sock_path, 0o666)
        srv.listen(8)
        log(f"bridge listening on {sock_path}")
        while True:
            srv.settimeout(0.5)
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                continue
            with conn:
                data = conn.recv(4096)
                if not data: continue
                try:
                    msg = json.loads(data.decode("utf-8"))
                except Exception as e:
                    log(f"bridge bad json: {e}")
                    continue
                if isinstance(msg, dict) and msg.get("op") == "focus" and "id" in msg:
                    send_cb({'info': 'focusTab',
                             'tabId': int(msg['id']),
                             'windowId': int(msg.get('win')) if 'win' in msg else None})
    except Exception as e:
        log("bridge_loop error: " + traceback.format_exc())

_bridge_thread = None
def start_bridge(sock_path: str, send_cb):
    global _bridge_thread
    if _bridge_thread and _bridge_thread.is_alive():
        return
    _bridge_thread = threading.Thread(target=bridge_loop, args=(sock_path, send_cb), daemon=True)
    _bridge_thread.start()

def main():
    log("host started")
    while True:
        msg = read_message()
        if msg is None:
            log("exiting main loop")
            break
        try:
            info = msg.get('info', '')
            if info == 'dumpTabsJson':
                path = msg.get('path') or '/tmp/rofi_chrome_tabs.json'
                write_json(path, msg.get('json', []))
                send_message({'result':'ok','info':info,'path':path})
                continue
            if info == 'dumpHistoryJson':
                path = msg.get('path') or '/tmp/rofi_chrome_history.json'
                # reuse your write_json helper (or write_lines/json as you prefer)
                write_json(path, msg.get('json', []))
                send_message({'result':'ok','info':info,'path':path})
                continue
            if info == 'startBridge':
                sock = msg.get('socket') or '/tmp/rofi_chrome.sock'
                start_bridge(sock, send_message)
                send_message({'result':'ok','info':info,'socket':sock})
                continue
            spawn = msg.get('spawn')
            if isinstance(spawn, list) and spawn:
                spawn_detached(spawn)
                send_message({'result':'', 'info': info or 'spawn'})
                continue
            # Legacy dmenu flow (kept for compatibility)
            flags  = msg.get('rofi_flags', msg.get('rofi-opts', []))
            choices = msg.get('choices', msg.get('opts', []))
            if not isinstance(flags, list) or not isinstance(choices, list):
                raise ValueError('Invalid payload: expected list fields for rofi_flags/choices')
            # If you still need dmenu integration, implement here.
            send_message({'result': '', 'info': info})
        except Exception as e:
            log("handler error: " + traceback.format_exc())
            send_message({'result':'', 'info':'error', 'error': str(e)})

if __name__ == '__main__':
    try:
        main()
    except Exception:
        log("fatal: " + traceback.format_exc())
