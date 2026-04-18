# Contributing to SSH AGRE

Thank you for your interest in contributing! This project follows strict UI/UX and architectural standards to maintain its "dark industrial" aesthetic and high performance.

## Core Mandates

### 1. Architectural Integrity
- **Log Display**: Terminal logs MUST NOT be rendered inside modals, dropdowns, or inline panels. Use the dedicated `/logs/:id` route for full-page terminal views.
- **Schedules UI**: Use a vertically stacked card list layout. Tables are deprecated.
- **Security**: Never commit secrets or API keys. Use environment variables.

### 2. UI/UX Standards

#### Mandatory Button Styles
We use three standard button styles. Do not create custom button variants.

- **Primary (`.btn-primary`)**: Save, Create, Update, Primary actions.
- **Secondary (`.btn-secondary`)**: Cancel, Close, Secondary actions (Standard "Log Out" style).
- **Danger (`.btn-danger`)**: Delete, Remove, Destructive actions.

**React Usage:**
```jsx
<button className="btn-secondary" onClick={handleAction}>Close</button>
<button className="btn-primary" onClick={handleSave}>Save Changes</button>
```

#### CSS Variables Reference
Always use these variables for colors and borders:
- `--bg-primary`: `#0d1117` (Main background)
- `--bg-secondary`: `#161b22` (Card background)
- `--accent-primary`: `#58a6ff` (Blue accent)
- `--accent-danger`: `#f85149` (Red accent)
- `--border-primary`: `#30363d` (Standard border)

---

## Workflow

### 1. Environment Setup
- **Backend**: Node.js 16+
- **Frontend**: React 18
- **Database**: SQLite (stored in `/data`)

### 2. Development Process
1.  **Branching**: Create a feature branch for your changes.
2.  **Linting**: Ensure your code follows the project's formatting.
3.  **Documentation**: If you fix a bug or add a feature, record it in `engineering_logs.md` under the "Issues & Fixes" section.
4.  **Testing**: Verify changes in the terminal and across different screen sizes (min-width 1200px focus).

### 3. Submitting Changes
- Ensure all commit messages are clear and descriptive.
- Submit a PR with a summary of the problem solved.
- Reference any relevant issues.

---

## File Locations for Reference
- **Global Styles**: `frontend/src/styles/global.css`
- **Button Definitions**: `frontend/src/styles/schedules.css`
- **API Routes**: `backend/src/routes/`
- **Database Operations**: `backend/src/db/`

For detailed system structure and historical fixes, see [engineering_logs.md](./engineering_logs.md).
