# PITWALL

A personal, browser-based F1 live timing dashboard — everything an F1 engineer sees on the pit wall, free and live.

## Running the Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Running the Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000
# Health check: http://localhost:8000/health
```
