import os
import sys
import socket
import argparse

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except OSError:
            return True

def find_available_port(preferred_port: int = 8000, fallback_port: int = 8001) -> int:
    if not is_port_in_use(preferred_port):
        return preferred_port
    print(f"[!] Warning: Port {preferred_port} is already in use by another process.")
    if not is_port_in_use(fallback_port):
        print(f"[+] Automatically switching to fallback port {fallback_port}.")
        return fallback_port
    for p in range(8002, 8020):
        if not is_port_in_use(p):
            print(f"[+] Automatically selected next available port {p}.")
            return p
    return fallback_port

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="ocrPlatform FastAPI Server")
    parser.add_argument("--port", type=int, default=None, help="Port to run server on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    args = parser.parse_args()

    port = args.port
    if port is None:
        env_port = os.getenv("PORT") or os.getenv("BACKEND_PORT")
        if env_port:
            port = int(env_port)
        else:
            port = find_available_port(8001, 8000)

    print(f"Starting ocrPlatform FastAPI Backend on http://{args.host}:{port} ...")
    print(f"Interactive Swagger Documentation: http://{args.host}:{port}/api/v1/docs")
    uvicorn.run("app.main:app", host=args.host, port=port, reload=True)
