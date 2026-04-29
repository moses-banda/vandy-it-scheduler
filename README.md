# VUIT Scheduler

A full-stack shift scheduling and dispatch management system built for Vanderbilt University IT. The application enables IT managers to create shifts, assign student workers to campus buildings, dispatch technicians to service calls, and track attendance — while giving workers a streamlined mobile-friendly dashboard to view shifts, check in, and respond to dispatches in real time.

---

## Features

### Manager Dashboard
- **Shift Management** — Create, edit, and assign shifts to student workers across campus buildings.
- **Coverage Grid** — Visual weekly overview of building coverage and staffing gaps.
- **Dispatch Panel** — Create and track service dispatches with priority levels and status updates.
- **Active Call Tracking** — Monitor in-progress calls and technician assignments.
- **Building Management** — Add and manage campus buildings/locations.
- **Worker Directory** — View all registered workers with role and status info.
- **Invite Codes** — Generate registration invite codes to onboard new student workers.

### Worker Dashboard
- **My Shifts** — View upcoming and past shift assignments.
- **Check-In / Check-Out** — Clock in and out of shifts with location-aware timestamps.
- **Incoming Calls** — Receive and respond to dispatch requests in real time.

### Core Platform
- **Role-Based Access Control** — Separate views and permissions for managers, admins, and workers.
- **JWT Authentication** — Secure token-based login and registration.
- **Real-Time Updates** — WebSocket support for live dispatch and call notifications.
- **Background Scheduler** — APScheduler runs periodic tasks (e.g., shift reminders, auto-close).
- **Mobile-Ready** — Capacitor integration for Android deployment.

---

## Tech Stack

| Layer      | Technology                                                     |
|------------|----------------------------------------------------------------|
| Frontend   | React 19, Vite, Tailwind CSS 4, React Router 7, Lucide Icons  |
| Backend    | FastAPI, SQLAlchemy (async), Pydantic, APScheduler             |
| Database   | PostgreSQL (via Supabase with asyncpg)                         |
| Auth       | python-jose (JWT), passlib (bcrypt)                            |
| Real-Time  | FastAPI WebSockets                                             |
| Mobile     | Capacitor (Android)                                            |

---

## Project Structure

```
vandy-it-scheduler/
├── backend/
│   ├── app/
│   │   ├── core/          # Config, security, auth utilities
│   │   ├── db/            # SQLAlchemy models and session management
│   │   ├── routers/       # API route handlers
│   │   │   ├── auth.py        # Login / register
│   │   │   ├── shifts.py      # Shift CRUD
│   │   │   ├── dispatches.py  # Dispatch management
│   │   │   ├── calls.py       # Call session tracking
│   │   │   ├── buildings.py   # Building CRUD
│   │   │   ├── checkin.py     # Shift check-in/out
│   │   │   ├── users.py       # User management
│   │   │   ├── invites.py     # Invite code generation
│   │   │   ├── dashboard.py   # Dashboard aggregations
│   │   │   ├── websocket.py   # Real-time notifications
│   │   │   └── health.py      # Health check
│   │   ├── schemas/       # Pydantic request/response models
│   │   ├── scheduler/     # APScheduler background jobs
│   │   ├── services/      # Business logic layer
│   │   └── utils/         # Shared helpers
│   ├── seed.py            # Quick seed script
│   ├── seed_full.py       # Full demo data seeder
│   ├── requirements.txt
│   └── .env               # Backend environment variables
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── ManagerDashboard.jsx
│   │   │   └── WorkerDashboard.jsx
│   │   ├── components/
│   │   │   ├── manager/   # ShiftCreator, DispatchPanel, CoverageGrid, etc.
│   │   │   ├── worker/    # CheckInButton, IncomingCall, ShiftCard
│   │   │   └── shared/    # Reusable UI components
│   │   ├── context/       # AuthContext (global auth state)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # Axios API client
│   │   └── utils/         # Frontend helpers
│   ├── android/           # Capacitor Android project
│   ├── package.json
│   └── .env               # Frontend environment variables
│
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **PostgreSQL** database (or a [Supabase](https://supabase.com) project)

### 1. Clone the Repository

```bash
git clone https://github.com/moses-banda/vandy-it-scheduler.git
cd vandy-it-scheduler
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with your database credentials:

```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:<port>/<database>
SECRET_KEY=<your-jwt-secret>
```

Run the server:

```bash
uvicorn app.main:app --reload --port 8000
```

Optionally seed the database with demo data:

```bash
python seed_full.py
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

Create a `.env` file in `frontend/` with:

```env
VITE_API_URL=http://localhost:8000
```

Start the dev server:

```bash
npm run dev
```

The app will be available at **http://localhost:5173**.

---

## API Endpoints

All routes are prefixed by their router module. Key endpoint groups:

| Endpoint Group    | Description                            |
|-------------------|----------------------------------------|
| `/auth`           | Login, register, token refresh         |
| `/users`          | User CRUD and role management          |
| `/shifts`         | Shift creation, assignment, listing    |
| `/checkin`        | Clock in / clock out                   |
| `/dispatches`     | Create and manage dispatch tickets     |
| `/calls`          | Active call session tracking           |
| `/buildings`      | Campus building management             |
| `/invites`        | Generate and validate invite codes     |
| `/dashboard`      | Aggregated stats for manager view      |
| `/ws`             | WebSocket for real-time notifications  |
| `/health`         | Server health check                    |

Full interactive API docs are available at **http://localhost:8000/docs** when the backend is running.

---

## License

This project is developed for Vanderbilt University IT operations.
