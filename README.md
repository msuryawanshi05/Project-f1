# 🏎️ PITWALL — Real-Time F1 Timing & Telemetry Dashboard

PITWALL is a high-performance, real-time Formula 1 timing and telemetry dashboard designed to give users a professional, engineer-like view of live and historical Grand Prix sessions. Built with modern web technologies, it aggregates telemetry, timing, weather data, and circuit maps completely free of cost.

---

## 🚀 Features

- **Live Session Timing**: Driver intervals, gaps, sector times (purple/green/yellow indicators), and live telemetry.
- **Dynamic Track Maps**: Interactive canvas-rendered track layouts with real-time sector highlights.
- **Smart Session State Tracking**: Detects if a race weekend is active, between sessions, upcoming, or live, transitioning the dashboard view dynamically.
- **Interactive Telemetry Charts**: Speed, RPM, gear, throttle, and brake telemetry visualization for in-depth driver lap comparisons.
- **Historical Data**: Full calendar, standings, and results from past weekends.
- **Performance Optimized**: Virtualized lists for rendering large numbers of laps or drivers without lagging.
- **Premium Aesthetics**: Harmonious dark-mode UI with smooth micro-animations.

---

## 🛠️ Tech Stack

### Frontend
- **React 18** (Vite-powered fast development server and build tool)
- **Zustand** (Ultra-fast, lightweight state management for live WebSocket data)
- **Recharts** (Interactive telemetry charting and data visualization)
- **Framer Motion** (Smooth transitions and UI micro-animations)
- **React Window** (Virtualized list rendering for high-performance driver tables)
- **Tailwind CSS & Custom Styling** (Responsive, modern glassmorphic theme)

### Backend
- **FastAPI** (Asynchronous, high-performance Python web API framework)
- **Uvicorn** (ASGI server for serving the backend)
- **FastF1 & SignalR Client** (Telemetry processing and live timing feed synchronization)
- **aiosqlite** (Asynchronous SQLite caching for local API performance optimization)
- **APScheduler** (Job scheduling for tracking session states and syncing calendars)

---

## 📊 Data Sources (100% Free)

- **Jolpica / Ergast API**: Race calendar, historical driver/team standings, and session results.
- **OpenF1 API**: Real-time telemetry, tire stints, and session feeds.
- **Wikipedia REST API**: Detailed circuit information and summaries.
- **f1-circuits (GeoJSON)**: Open-source circuit layout data for rendering track maps.

---

## ⚙️ Project Structure

```text
Project F1/
├── pitwall/
│   ├── backend/       # FastAPI Backend
│   │   ├── main.py    # Main FastAPI application & endpoints
│   │   ├── db.py      # SQLite cache management
│   │   └── ...        # Schedulers, SignalR timing sync client, and tests
│   └── frontend/      # React + Vite Frontend
│       ├── public/    # Circuit GeoJSON and assets
│       └── src/       # Source code (components, hooks, pages, store)
└── README.md          # Project documentation
```

---

## 🔧 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)

### Running the Backend

1. Navigate to the backend directory:
   ```bash
   cd pitwall/backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   # Windows:
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux:
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will run on: `http://localhost:8000` (Health check: `http://localhost:8000/health`)*

### Running the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd pitwall/frontend
   ```
2. Install Node packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on: `http://localhost:5173`*

---

## 🏁 Future Updates & Rules Alignment
- Alignment with updated **2026 FIA Technical Regulations** (e.g., removing legacy DRS references).
- Complete Monaco GP telemetry hero cards.
- Integrated audio sound toggles.
