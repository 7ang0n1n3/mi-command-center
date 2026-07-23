# MI Command

Offline-first Major Incident command dashboard for Service Desk teams.

MI Command is a portable, PowerShell-driven local web app for declaring and managing Major Incidents during a war-room response. It runs from the project folder, writes incident data to `mi-data.json`, and is accessible only from the host machine.

## Features

- Declare Major Incidents with title, priority, severity, impact, affected services, initial assessment, and Major Incident Manager.
- Use a top navigation layout with Dashboard, All Incidents, Playbooks, Data & Settings, and Declare Major Incident controls available across the app.
- Switch between dark and light mode from the top navigation; the browser remembers the selected theme.
- Show the top-bar clock in JST regardless of the user's local timezone.
- Track status from Declared through Investigating, Mitigating, Monitoring, and Resolved.
- Enforce one-step status transitions in the status progression control, while the header Mark Resolved button can close an incident directly.
- Manage each incident from a detailed Overview workspace with incident summary fields, full incident details, priority/severity, impacted company, JST date/time fields, tickets, CI, and impact information.
- Maintain a live timeline, editable action table, and War Room participant roster.
- Add timeline audit entries when overview, incident detail, action, and War Room information changes.
- Track action items with start, end, action, owner, status, and update fields. New action items appear at the top of the list, start with status `-`, fill start time when moved to In Progress, and fill end time when completed.
- Capture War Room bridge URL and grouped participants for MIM, Technical Team, Vendor, SME, and Decision Maker/PSM/Leadership.
- Generate stakeholder communications from editable templates in `comms/`.
- Keep valid communication templates available even when one template file is missing.
- Export and import incident data as JSON.
- Export per-incident reports as HTML or plain text, including overview, incident details, actions, War Room information, and timeline.
- Keep multiple browser tabs on the host synchronized through the PowerShell local server.

## Requirements

- Windows 10/11
- PowerShell 5.1 or newer
- A current version of Chrome or Edge

No internet connection or external package installation is required.

## Quick Start

Double-click `start.bat`, or run the PowerShell launcher manually:

```powershell
cd path\to\mi-command-center
.\start.ps1
```

The launcher prints a console banner, the local URL, and the data file path. Open the local URL shown in the console, usually:

```text
http://localhost:8080
```

Keep the launcher window open while using the app. Closing that window stops the local command center; minimize it if you want it out of the way.

Incident data is saved to `mi-data.json` in the same folder. The launcher creates this runtime file on first use; `mi-data.example.json` is the empty example committed to the repository.

## Local Server Mode

Run `start.bat` or `.\start.ps1`, then open the localhost URL printed in the console. The server binds only to `localhost`; other computers cannot connect.

When connected through the PowerShell server, the dashboard polls every 3 seconds and shows `Live · team sync` in the top bar. This keeps browser tabs on the same host synchronized.

Team sync reconciles timeline entries by ID, action records by their update time, and core incident fields by per-field timestamps. Action deletions are preserved with tombstones so older clients do not restore deleted work items. Expanded incident details and War Room lists are selected from the newer incident snapshot rather than merged field by field.

Synchronization is best-effort: the server accepts whole-file writes without locking or revision preconditions. Avoid editing the same incident details or War Room list in multiple tabs at the same time, and keep JSON backups for operationally important incidents.

## Custom Port

```powershell
.\start.ps1 -Port 9090
```

## Data Storage

| Run mode | Storage location |
| --- | --- |
| `start.bat` / `start.ps1` | `mi-data.json` in the app folder |
| `index.html` with a file linked in Data & Settings | Browser-selected JSON file |
| `index.html` without a linked file | Browser local storage for that browser profile and origin |

The recommended mode is `start.bat` or `start.ps1` because it keeps the app and data file together.

Direct file linking uses the Chromium File System Access API. If the browser does not expose that API for the way `index.html` was opened, use the PowerShell launcher. Browser local storage is a fallback, not a shared team data store; export a JSON backup before clearing site data or changing browser profiles.

## Language and Encoding

Text fields support Japanese and other Unicode text. The page declares UTF-8, browser storage uses JavaScript strings, JSON export/import preserves Unicode text, and the PowerShell launcher reads and writes `mi-data.json` as UTF-8.

When using Local Server Mode, the app saves data through `/api/data` as JSON. If Japanese text appears corrupted after editing the data file outside the app, resave the file as UTF-8 before importing or relaunching.

## Communication Templates

Templates are plain text files in `comms/`:

| File | Purpose |
| --- | --- |
| `comms/initial-notification.txt` | First stakeholder notification |
| `comms/progress-update.txt` | Periodic incident update |
| `comms/resolution-notice.txt` | All-clear / resolution notice |

Template files can use placeholders such as `{{title}}`, `{{status}}`, `{{priorityLabel}}`, `{{severityLabel}}`, `{{mim}}`, `{{roombridge}}`, `{{duration}}`, `{{org}}`, and `{{openActions}}`.

Add, remove, or reorder templates in `comms/manifest.json`. Refresh the browser tab after template changes.

If one template file is missing or invalid, the Communications tab still shows the templates that loaded successfully and displays a warning for the failed entries.

## Action List Templates

Action list templates are plain text files in `action-lists/` and are loaded from `action-lists/manifest.json`. The manifest controls which templates appear in the Actions tab dropdown. Each template can contain one or more action blocks separated by a blank line.

Included samples are `start-of-triage.txt`, `database-triage.txt`, and `network-triage.txt`.

Supported fields are `ITEM`, `Action`, or `Task` for the action text, plus optional `Owner`, `Start`, `End`, `Status`, and `Update` fields. `Status` accepts `In Progress`, `Completed`, or `KIV`.

Action list templates can use placeholders such as `{{title}}`, `{{status}}`, `{{priorityLabel}}`, `{{severityLabel}}`, `{{mim}}`, `{{roombridge}}`, `{{time}}`, `{{org}}`, and `{{services}}`.

## Incident Workspace

Each incident has dedicated tabs:

| Tab | Purpose |
| --- | --- |
| Overview | Status progression, incident summary, business impact, root cause, resolution, next action, and detailed incident fields. |
| Timeline | Chronological audit trail with the manual note entry row at the top. |
| Actions | Editable action table with start/end, owner, status, and latest update. |
| War Room | Bridge URL plus grouped people tables for MIM, technical team, vendors, SMEs, and decision makers. |
| Communications | Template-based stakeholder messages for S1–S3 incidents, including the `{{roombridge}}` placeholder for the War Room Bridge URL. The tab is hidden for S4 and S5. |

Reports use the user-entered `Incident No` from the Overview details wherever possible, including the overview section and footer.

The All Incidents table also displays and searches by the user-entered `Incident No`, falling back to the internal incident id when `Incident No` is blank.

## Project Structure

```text
mi-command-center/
├── index.html
├── mi-data.example.json
├── mi-data.json                 # generated at runtime; not committed
├── start.bat
├── start.ps1
├── CHANGELOG.md
├── README.md
├── action-lists/
│   ├── database-triage.txt
│   ├── manifest.json
│   ├── network-triage.txt
│   ├── start-of-triage.txt
│   └── triage-action-list.txt
├── comms/
│   ├── manifest.json
│   ├── initial-notification.txt
│   ├── progress-update.txt
│   └── resolution-notice.txt
├── css/
│   └── styles.css
└── js/
    ├── actionLists.js
    ├── app.js
    ├── comms.js
    ├── labels.js
    ├── report.js
    └── storage.js
```

## Development Notes

- The app has no build step.
- There is no automated test suite in the repository.
- `start.ps1` serves static files and implements `/api/status` and `/api/data`.
- `start.ps1` validates incoming `/api/data` payloads before writing to `mi-data.json`.
- Browser code stores incident state through `js/storage.js`.
- `js/app.js` owns rendering, view state, and incident interactions.
- `js/report.js` builds downloadable incident reports.
- Built-in Playbooks are defined in `js/app.js`. Action list templates are loaded from `action-lists/manifest.json`.

Run JavaScript syntax checks with:

```powershell
node --check js/app.js
node --check js/storage.js
node --check js/comms.js
node --check js/report.js
node --check js/labels.js
```

## Security Notes

The PowerShell server binds only to `localhost` and sends no cross-origin resource sharing headers. Incident data is unavailable to other network hosts through this server.

The server provides no authentication, authorization, TLS, or per-user audit identity. Any process or user with access to the host can access the local server and its data.

## License

MIT. Use freely within your organisation.
