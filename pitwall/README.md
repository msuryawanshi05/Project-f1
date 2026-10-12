# pitwall/

Application source. See the [repository README](../README.md) for what PITWALL is, the data
sources, architecture and setup.

```
pitwall/
├── backend/     FastAPI — SignalR bridge, WebSocket broadcaster, cached Jolpica/OpenF1 endpoints
├── frontend/    React 18 + Vite + Tailwind + Zustand
└── scripts/     record-demo.mjs — regenerates the README demo GIF
```

Quick start, from this directory:

```bash
cd backend  && python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt && uvicorn main:app --port 8000
cd frontend && npm install && npm run dev
```
