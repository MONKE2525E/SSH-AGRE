# SSH-AGRE Development Guide

A comprehensive guide for developers and AI agents working on SSH-AGRE. This document combines architecture, standards, and workflow into a single reference.

---

## Quick Navigation

- **New to the project?** Start with "Project Vision & Goals"
- **Want to contribute?** Jump to "Contributing Guidelines"
- **Need system details?** See "System Architecture & How It Works"
- **Looking for a file?** Check "Directory Structure & File Map"
- **AI agents?** See "For AI Agents" section at the end

---

## Project Vision & Goals

SSH-AGRE (SSH Aggregator) is a professional-grade, web-based management platform designed for systems administrators who manage multiple remote environments.

### Primary Goals:
- **Centralized Management**: Aggregate dozens of SSH connections into a single, persistent browser tab.
- **Industrial Aesthetic**: Maintain a "Pure Gray" industrial design—minimalist, high-contrast, and focused on data density.
- **Automation First**: Enable users to move from manual command entry to scheduled, batch-executed automation.
- **Security & Integrity**: Ensure that even though it's a web tool, it follows strict security protocols (JWT, Bcrypt, Input Validation, and least-privilege permissions).

---

## Design & UX Standards

The application follows a strict **Dark Industrial** theme. All developers must adhere to these rules:

### Color Palette
- **Primary Background**: `#000000` (Pure Black)
- **Elevated Panels/Cards**: `#1a1a1a` (Pure Gray / `--bg-panel`)
- **Accent Color**: Standard industrial Blue/Gray tones.

### Typography & Layout
- **Fonts**: Monospace for all terminal and data-heavy views.
- **Maximum content width**: 1200px for panels.
- **Cards over tables**: Card-based lists for connections and schedules (Tables are deprecated).

### Mandatory Interactions
- **Standardized Buttons**: `.btn-primary` (Action), `.btn-secondary` (Cancel/Log Out), `.btn-danger` (Delete).
- **No native browser artifacts**: Hide number spinners, standardize scrollbars.

---

## System Architecture & How It Works

### The Flow of Data:

```
User Browser
    ↓
React Frontend (xterm.js)
    ↓ (WebSocket: /ws/terminal?token=<jwt>)
Node.js Backend (Express REST API)
    ↓ (ssh2 library)
SSH Server (Remote Host)
```

### Core Components

| Component | Role | Technology |
|-----------|------|------------|
| **Frontend** | Terminal emulation, UI | React 18 + xterm.js |
| **Backend** | Session management, auth, scheduling | Node.js + Express |
| **Database** | Users, connections, commands, logs | SQLite |
| **SSH Engine** | Connection pooling, stream handling | ssh2 library |
| **Scheduler** | Cron-based task automation | node-cron |

### How Each Feature Works

#### 1. Authentication
- User logs in via `/api/auth/login`
- JWT token issued and stored in `localStorage`
- Token included in WebSocket headers for authentication

#### 2. SSH Terminal (Real-time)
- Frontend initializes xterm.js instance
- WebSocket connection opened to `/ws/terminal?token=<jwt>`
- Backend uses ssh2 to create raw SSH tunnel
- Data pipes: `Remote Server <-> SSH2 <-> WebSocket <-> xterm.js`

#### 3. Task Scheduling
- Background `scheduler.js` utility runs using `node-cron`
- Polls SQLite database for active schedules
- When trigger fires, spawns temporary SSH sessions to execute defined `commandIds`

#### 4. Batch Execution
- User sends single command string + array of `connectionIds`
- Backend iterates through IDs, opening parallel or sequential SSH channels
- Executes payload across all targets simultaneously

---

## Directory Structure & File Map

```
SSH-AGRE/
├── backend/
│   ├── src/
│   │   ├── index.js                  # Entry point, Express setup, WebSocket init
│   │   ├── db/
│   │   │   ├── database.js           # SQLite initialization
│   │   │   ├── users.js              # User CRUD operations
│   │   │   ├── connections.js        # SSH connection CRUD
│   │   │   ├── commands.js           # Command macro CRUD
│   │   │   ├── schedules.js          # Scheduled task CRUD
│   │   │   ├── knownHosts.js         # Host key verification logic
│   │   │   └── audit.js              # Command execution logging
│   │   ├── ssh/
│   │   │   └── sshManager.js         # Session pooling & stream handling ⭐
│   │   ├── routes/                   # REST API endpoints
│   │   │   ├── auth.js, users.js, connections.js, commands.js, schedules.js, batch.js
│   │   ├── middleware/               # Auth, validation, rate limiting
│   │   ├── ws/                       # WebSocket handlers
│   │   │   └── terminal.js
│   │   └── utils/
│   │       └── scheduler.js          # Cron job executor
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.js                    # Routing and high-level layout
│   │   ├── contexts/
│   │   │   └── AuthContext.js        # JWT state and user permissions ⭐
│   │   ├── components/
│   │   │   ├── Terminal.js           # xterm.js wrapper ⭐
│   │   │   ├── SetupWizard.js        # Zero-config initialization
│   │   │   ├── ConnectionModal.js    # Connection form
│   │   │   ├── ScheduleModal.js      # Schedule form
│   │   │   └── (other components)
│   │   └── styles/
│   │       ├── global.css            # CSS variables and resets
│   │       └── (component CSS)
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml                # Multi-container orchestration
├── .gitignore
├── README.md                         # User-facing docs
├── DEVELOPMENT.md                    # This file
├── LICENSE
└── .env                              # (not committed)

⭐ = Critical files for understanding the system
```

---

## Contributing Guidelines

### Core Mandates (Non-Negotiable)

These architectural rules exist for a reason. Do not bypass them.

1. **Log Display**: Terminal logs MUST NOT be rendered inside modals, dropdowns, or inline panels. Use the dedicated `/logs/:id` route for full-page terminal views.
2. **Schedules UI**: Use a vertically stacked card list layout. Tables are deprecated.
3. **Security**: Never commit secrets or API keys. Use environment variables.
4. **Host Key Verification**: Always verify SSH host keys against known_hosts to prevent MITM attacks.

### UI/UX Standards

#### Button Styles
Do not create custom button variants. Use exactly these three classes:

- **`.btn-primary`**: Save, Create, Update, Primary actions
- **`.btn-secondary`**: Cancel, Close, Secondary actions (Standard "Log Out" style)
- **`.btn-danger`**: Delete, Remove, Destructive actions

**React Usage Example:**
```jsx
<button className="btn-secondary" onClick={handleAction}>Close</button>
<button className="btn-primary" onClick={handleSave}>Save Changes</button>
```

#### CSS Variables Reference
Always use these variables for colors and borders. Do not hardcode colors:

```css
--bg-primary: #0d1117       /* Main background */
--bg-secondary: #161b22     /* Card background */
--bg-panel: #1a1a1a         /* Elevated panels/cards */
--accent-primary: #58a6ff   /* Blue accent */
--accent-danger: #f85149    /* Red accent */
--border-primary: #30363d   /* Standard border */
--text-primary: #c9d1d9     /* Main text color */
```

---

## Development & Deployment

### Environment Setup

**Prerequisites:**
- Node.js 16+ (or use Docker)
- Docker & Docker Compose (for containerized setup)

**Backend Development:**
```bash
cd backend
npm install
npm run dev
```

**Frontend Development:**
```bash
cd frontend
npm install
npm start
```

**Docker Deployment:**
```bash
docker-compose up -d --build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `ssh-agre-secret-key` | JWT signing secret - **CHANGE IN PRODUCTION** |
| `PORT` | `3001` | Backend API port |
| `NODE_ENV` | `development` | Node environment |

### Development Process

1. **Branching**: Create a feature branch for your changes.
2. **Code Style**: 
   - Write minimal comments (only WHY, not WHAT)
   - Three similar lines beat premature abstraction
   - No speculative features or error handling for impossible scenarios
3. **Documentation**: If you fix a bug or add a feature, record it in this file under the relevant section.
4. **Testing**: 
   - Verify changes work in the terminal
   - Test across different screen sizes (minimum 1200px focus)
   - Check xterm.js behavior (varies across browsers)
5. **Commits**: Write clear, descriptive commit messages.

### Submitting Changes

1. Ensure code follows project standards
2. Test thoroughly in terminal and across screen sizes
3. Submit PR with problem summary
4. Reference relevant issues

---

## Security Protocols

The project maintains strict security standards:

- **Least Privilege**: GitHub Actions run with minimal permissions (contents: read)
- **Input Validation**: All API routes use `express-validator`. Command execution inputs checked for type integrity to prevent shell injection.
- **Code Scanning**: Every push analyzed by CodeQL (Default Setup) and SonarCloud.
- **Dependency Management**: Critical sub-dependencies pinned via `overrides` in `package.json` to bypass vulnerabilities in legacy tools.
- **Authentication**: JWT tokens with 24h expiration, bcrypt password hashing with salt rounds.
- **Rate Limiting**: 100 requests per 15 minutes per IP.
- **HTTP Headers**: Helmet for security headers.
- **CORS**: Configured for specific origins only.
- **SSH Security**: Host key verification (MITM protection), known_hosts database.

---

## Known Tech Debt & Roadmap

### Currently Tracking
- [ ] Transition from `sqlite3` to a client-server DB (Postgres) if scaling past 100+ concurrent sessions.
- [ ] Implement SSH Key passphrase support.
- [ ] Add SFTP browser component to side panel.
- [ ] Real-time notification system for scheduled task failures.

### Known Limitations
- SSH connections from Docker containers to the host machine: use `host.docker.internal` (Docker Desktop) or configure `extra_hosts` in docker-compose.yml (Linux).
- Session timeout: 30 minutes of inactivity closes connections automatically.
- SQLite performance: suitable for current scale; monitor if approaching 100+ concurrent sessions.

---

## For AI Agents: Additional Context

### Code Philosophy
This project follows intentional design choices. Respect them:

- **Minimal code**: Three similar lines beats premature abstraction.
- **No speculative features**: Don't design for hypothetical requirements.
- **Trust the framework**: Don't add error handling for scenarios that can't happen.
- **Default to deletion**: Remove unused code completely rather than commenting it out.
- **Security at boundaries**: Validate user input and external APIs, trust internal code.

### When Working on SSH-AGRE

1. **Read the mandate sections first** — they explain *why* things are structured this way.
2. **Understand the socket flow**:
   - SSH session management is complex and error-prone
   - Changes here directly affect user experience
   - Host key verification hangs can silently fail—always test thoroughly
3. **Test on actual terminals**: xterm.js behavior varies across browsers and terminal sizes.
4. **Remember session timeout**: Sessions auto-close after 30 minutes of inactivity.
5. **Know the 30+ minute goal**: Sessions should stay alive 30+ minutes with keep-alive packets.

### Critical Design Decisions (Don't Change These)

- **Host Key Verification**: Non-negotiable for security. Always verify against known_hosts database.
- **Terminal Emulation**: Uses xterm.js with 256-color support and explicit TUI environment variables (FORCE_COLOR, LESS, PAGER, EDITOR).
- **WebSocket Framing**: Data is JSON-stringified. Respect message boundaries. Each frame must be complete.
- **Session Pooling**: Active sessions stored in memory Map(). Cleanup on disconnect is critical to prevent leaks.
- **Database Operations**: Uses callback-based sqlite3 API. Promises are wrapped by developers (not a built-in feature).
- **Buffer Management**: Output buffering with MAX_BUFFER_SIZE=16KB to prevent UI freezing on high-speed data.

### Red Flags (Don't Do These)

- ❌ Bypassing host key verification for "ease"
- ❌ Rendering large logs inside modals (will freeze the UI)
- ❌ Creating custom button styles (use the three standard ones only)
- ❌ Adding `--no-verify` to git commands without explicit user request
- ❌ Committing `.env` or `.claude/` files
- ❌ Hard-coding IP addresses, usernames, or credentials
- ❌ Using tables for layout (use cards instead)
- ❌ Rendering terminal logs inline (use `/logs/:id` route)

### Common Pitfalls & Solutions

| Problem | Why It Happens | Solution |
|---------|----------------|----------|
| SSH hangs with "blinking cursor" | hostVerifier callback returns undefined | Ensure all code paths in host key verification return `true` or `false` |
| UI freezes on large output | Unbuffered terminal data sent all at once | Use output buffering with MAX_BUFFER_SIZE flushing |
| Connections to host machine timeout | Docker container can't route to host | Use `host.docker.internal` (Docker Desktop) or configure extra_hosts (Linux) |
| Session persists after disconnect | Cleanup() not called properly | Ensure stream.close() and client.end() in cleanup flow |
| Modal dialogs overflow on small screens | Fixed width without responsive design | Use max-width and percentage-based widths |

---

## Docker Quick Reference

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs backend
docker-compose logs frontend

# Reset database
docker-compose down
rm -rf ./data
docker-compose up -d

# Access running containers
docker-compose exec sshagre-backend-1 sh
docker-compose exec sshagre-frontend-1 sh
```

---

## Still Have Questions?

- **"How does [feature] work?"** → See "System Architecture & How It Works"
- **"Where's the code for [feature]?"** → Check "Directory Structure & File Map"
- **"What's the standard for [thing]?"** → Check "Design & UX Standards" or "Contributing Guidelines"
- **"Why was [thing] designed this way?"** → Check "Known Tech Debt & Roadmap" or "Critical Design Decisions"

---

**For user-facing documentation and quick start**, see [README.md](./README.md).

**Last updated**: 2026-04-20  
**Current version**: 0.2.1
