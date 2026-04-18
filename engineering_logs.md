# Engineering Logs - SSH-AGRE

## 1. Project Vision & Goals
SSH-AGRE (SSH Aggregator) is a professional-grade, web-based management platform designed for systems administrators who manage multiple remote environments.

### Primary Goals:
- **Centralized Management**: Aggregate dozens of SSH connections into a single, persistent browser tab.
- **Industrial Aesthetic**: Maintain a "Pure Gray" industrial design—minimalist, high-contrast, and focused on data density.
- **Automation First**: Enable users to move from manual command entry to scheduled, batch-executed automation.
- **Security & Integrity**: Ensure that even though it's a web tool, it follows strict security protocols (JWT, Bcrypt, Input Validation, and least-privilege permissions).

---

## 2. Design & UX Standards
The application follows a strict **Dark Industrial** theme. AI agents and developers must adhere to these rules:

- **Color Palette**: 
  - Primary Background: `#000000` (Pure Black)
  - Elevated Panels/Cards: `#1a1a1a` (Pure Gray / `--bg-panel`)
  - Accent Color: Standard industrial Blue/Gray tones.
- **Typography**: Monospace fonts for all terminal and data-heavy views.
- **Layout**: 
  - Maximum content width of `1200px` for panels.
  - Card-based lists for connections and schedules (Tables are deprecated).
- **Interactions**: 
  - Standardized Buttons: `.btn-primary` (Action), `.btn-secondary` (Cancel/Log Out), `.btn-danger` (Delete).
  - No native browser artifacts (e.g., hidden number spinners, no default scrollbars where possible).

---

## 3. System Architecture & How It Works

### The Flow of Data:
1.  **Authentication**: User logs in via `/api/auth/login`. A JWT is issued and stored in `localStorage`.
2.  **SSH Terminal (Real-time)**: 
    - The Frontend initializes an `xterm.js` instance.
    - A WebSocket connection is opened to `/ws/terminal`.
    - The Backend uses `ssh2` to create a raw tunnel. Data is piped: `Remote Server <-> SSH2 <-> WebSocket <-> xterm.js`.
3.  **Task Scheduling**: 
    - A background `scheduler.js` utility runs using `node-cron`.
    - It polls the SQLite database for active schedules.
    - When a trigger hits, it spawns temporary SSH sessions to execute the defined `commandIds`.
4.  **Batch Execution**:
    - Users send a single command string + an array of `connectionIds`.
    - The backend iterates through the IDs, opening parallel or sequential SSH channels to execute the payload.

---

## 4. Directory Structure & File Map

### `/backend` (Node.js/Express)
- `src/index.js`: Entry point. Sets up Express, WebSockets, and the Scheduler.
- `src/db/`: 
    - `database.js`: SQLite initialization and `better-sqlite3` configuration.
    - `users.js`, `connections.js`, `schedules.js`, `commands.js`: CRUD logic for each entity.
    - `audit.js`: Handles system-wide logging and execution history.
- `src/ssh/sshManager.js`: The heart of the SSH logic. Manages connection pooling and raw stream handling.
- `src/routes/`: REST API endpoints. `batch.js` handles multi-target execution.
- `src/utils/scheduler.js`: Logic for cron-based task execution.

### `/frontend` (React 18)
- `src/App.js`: Routing and high-level layout.
- `src/contexts/AuthContext.js`: Manages JWT state and user permissions.
- `src/components/`:
    - `Terminal.js`: The xterm.js wrapper.
    - `SetupWizard.js`: The zero-config initialization flow for first-run.
    - `ConnectionModal.js` / `ScheduleModal.js`: Forms for data entry.
- `src/styles/`:
    - `global.css`: Variable definitions (`--bg-panel`) and global resets.
    - `dashboard.css`: Layout for the main multi-session view.

---

## 5. Security Protocols
- **Least Privilege**: GitHub Actions run with `permissions: contents: read`.
- **Validation**: All API routes use `express-validator`. Command execution inputs are checked for type integrity to prevent shell injection.
- **Scanning**: Every push is analyzed by CodeQL (Default Setup) and SonarCloud.
- **Dependencies**: Critical sub-dependencies (like `serialize-javascript`) are pinned via `overrides` in `package.json` to bypass vulnerabilities in legacy tools like `react-scripts`.

---

## 6. Development & Deployment
- **Containerization**: Entirely Docker-based. Use `docker-compose up -d --build`.
- **Environment**: Managed via `.env` (JWT secrets, Port mappings).
- **CI/CD**: `ci.yml` builds on Node 20.x and ensures a clean `npm ci` install.

---

## 7. Roadmap & Known Tech Debt
- [ ] Transition from `better-sqlite3` to a client-server DB (Postgres) if scaling past 100+ concurrent sessions.
- [ ] Implement SSH Key passphrase support.
- [ ] Add SFTP browser component to the side panel.
- [ ] Real-time notification system for scheduled task failures.
