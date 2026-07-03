# MI Command

Offline Major Incident command dashboard for Service Desk teams.

MI Command is a portable, PowerShell-driven local web app for declaring and managing Major Incidents during a war-room response. It runs from the project folder, writes incident data to `mi-data.json`, and can be shared with teammates on the same network from the host machine.

## Features

- Declare Major Incidents with title, priority, severity, impact, affected services, initial assessment, and Major Incident Manager.
- Track status from Declared through Investigating, Mitigating, Monitoring, and Resolved.
- Enforce one-step status transitions and record explicit reopen events from Resolved back to Monitoring.
- Maintain a live timeline, action checklist, and war-room role assignments.
- Add timeline audit entries when actions are added, closed, reopened, or deleted.
- Generate stakeholder communications from editable templates in `comms/`.
- Keep valid communication templates available even when one template file is missing.
- Export and import incident data as JSON.
- Export per-incident reports as HTML or plain text.
- Run in team mode with automatic refresh and field-aware merge behavior through the PowerShell local server.

## Requirements

- Windows 10/11
- PowerShell 5.1 or newer
- Chrome or Edge

No internet connection or external package installation is required.

## Quick Start

Double-click `start.bat`, or run the PowerShell launcher manually:

```powershell
cd path\to\sd-dash
.\start.ps1
```

Open the local URL shown in the console, usually:

```text
http://localhost:8080
```

Incident data is saved to `mi-data.json` in the same folder.

## Team Mode

1. Run `start.bat` or `.\start.ps1` on the war-room host PC.
2. Share the network URL printed in the console, for example `http://192.168.1.50:8080`.
3. Team members open that URL in Chrome or Edge.

When connected through the PowerShell server, the dashboard polls every 3 seconds and shows `Live · team sync` in the top bar.

Team sync reconciles remote content changes by merging timeline entries, action records, and overview fields. Action deletions are preserved with tombstones so older clients do not restore deleted work items.

## Custom Port

```powershell
.\start.ps1 -Port 9090
```

## Data Storage

| Run mode | Storage location |
| --- | --- |
| `start.bat` / `start.ps1` | `mi-data.json` in the app folder |
| `index.html` with linked file | Browser-selected JSON file |
| `index.html` only | Browser local storage |

The recommended mode is `start.bat` or `start.ps1` because it keeps the app and data file together.

## Communication Templates

Templates are plain text files in `comms/`:

| File | Purpose |
| --- | --- |
| `comms/initial-notification.txt` | First stakeholder notification |
| `comms/progress-update.txt` | Periodic incident update |
| `comms/resolution-notice.txt` | All-clear / resolution notice |

Template files can use placeholders such as `{{title}}`, `{{status}}`, `{{priorityLabel}}`, `{{severityLabel}}`, `{{mim}}`, `{{duration}}`, `{{org}}`, and `{{openActions}}`.

Add, remove, or reorder templates in `comms/manifest.json`. Refresh the browser tab after template changes.

If one template file is missing or invalid, the Communications tab still shows the templates that loaded successfully and displays a warning for the failed entries.

## Project Structure

```text
sd-dash/
├── index.html
├── mi-data.json
├── start.bat
├── start.ps1
├── CHANGELOG.md
├── README.md
├── action-lists/
│   └── triage-action-list.txt
├── comms/
│   ├── manifest.json
│   ├── initial-notification.txt
│   ├── progress-update.txt
│   └── resolution-notice.txt
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── comms.js
    ├── labels.js
    ├── report.js
    └── storage.js
```

## Development Notes

- The app has no build step.
- `start.ps1` serves static files and implements `/api/status` and `/api/data`.
- `start.ps1` validates incoming `/api/data` payloads before writing to `mi-data.json`.
- Browser code stores incident state through `js/storage.js`.
- `js/app.js` owns rendering, view state, and incident interactions.
- `js/report.js` builds downloadable incident reports.

Run JavaScript syntax checks with:

```powershell
node --check js/app.js
node --check js/storage.js
node --check js/comms.js
node --check js/report.js
node --check js/labels.js
```

## Security Notes

Team mode is intended for trusted local networks. The PowerShell server exposes local incident data to users who can reach the shared URL. Avoid running it on untrusted networks unless access controls are added.

## License

MIT. Use freely within your organisation.
