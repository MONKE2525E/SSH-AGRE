# Engineering Logs - SSH AGRE

## System Structure

SSH AGRE is a web-based SSH connection aggregator designed with a dark industrial aesthetic. It allows users to manage multiple SSH sessions, automate commands, and schedule tasks.

### Architecture Overview

- **Frontend**: React 18 SPA
  - **State Management**: React Context (AuthContext)
  - **Terminal**: xterm.js for high-performance terminal emulation
  - **Styling**: Vanilla CSS with CSS Variables for theme consistency
  - **Key Components**: `Terminal`, `ConnectionModal`, `ScheduleModal`, `SetupWizard`

- **Backend**: Node.js Express API
  - **Database**: SQLite (via `better-sqlite3` or `sqlite3`)
  - **SSH Engine**: `ssh2` library for robust SSH/SFTP capabilities
  - **Real-time**: WebSockets (`ws`) for terminal data streaming
  - **Authentication**: JWT with bcrypt password hashing
  - **Scheduling**: `node-cron` or similar for task automation

- **Data Model**:
  - `users`: Authentication and profile data
  - `connections`: SSH server details (host, port, user, credentials)
  - `commands`: Reusable command snippets
  - `schedules`: Automated command execution rules
  - `audit_logs`: History of actions and system events

### Directory Map

- `/backend`: API and SSH logic
  - `/src/db`: Database schemas and operations
  - `/src/ssh`: SSH connection management
  - `/src/ws`: WebSocket handlers for terminal
- `/frontend`: UI and terminal logic
  - `/src/components`: UI elements following strict design standards
  - `/src/styles`: Theme and layout definitions
- `/data`: Persistent storage for SQLite database

---

## Issues & Fixes

### [2026-04-18] Documentation Initialization
- **Issue**: Project lacked a centralized engineering log and contribution guidelines were fragmented.
- **Fix**: Created `engineering_logs.md` and synchronized `CONTRIBUTING.md` with internal standards.

### [2026-04-18] Schedule UI Refactor
- **Issue**: The Schedules UI was feeling clunky and relied on a hidden dropdown menu for primary actions, diverging from the direct card layout standard.
- **Fix**: Removed the `ActionMenu` component entirely from `SchedulesPanel`. Replaced it with inline, standard `.btn-secondary` and `.btn-danger` buttons directly visible on each schedule card. Fixed `max-width` on the panel container to properly adhere to the 1200px requirement and removed absolute positioning for cleaner flexbox alignment.

---

## Technical Debt & Roadmap
- [ ] Implement robust error handling for SSH connection timeouts.
- [ ] Add support for SSH Key-based authentication (currently password-heavy).
- [ ] Enhance terminal scrollback performance for long-running logs.
