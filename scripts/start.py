from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import webbrowser

parser = argparse.ArgumentParser(description="Start Drone Weather Lab locally")
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--no-browser", action="store_true")
args = parser.parse_args()
directory = Path(__file__).resolve().parents[1] / "dist"
try:
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(SimpleHTTPRequestHandler, directory=str(directory)))
except OSError:
    raise SystemExit("Port unavailable. Try: python scripts/start.py --port 8001")
url = f"http://127.0.0.1:{args.port}/"
print(f"Drone Weather Lab 0.8: {url}\nKeep this window open. Press Ctrl+C to stop.", flush=True)
if not args.no_browser:
    webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
