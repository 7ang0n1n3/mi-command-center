# Changelog

All notable changes to MI Command are documented here.

This project follows a simple date-based changelog because it is distributed as a portable internal tool rather than a packaged release.

## 2026-07-08

### Changed

- Moved the primary navigation from a left sidebar to a horizontal top navigation bar.
- Reworked the incident detail screen into a fuller command workspace with a large incident header, status progression, summary cards, and expanded incident details.
- Added incident detail fields for Incident No, priority/severity, JST event times, priority justification, reported/detected fields, impacted services/company/users, CI, problem ticket, and change ticket.
- Reworked Actions into a table with start, end, action, owner, status, and update columns.
- New action items are inserted at the top of the action list.
- Reworked War Room into grouped people tables for MIM, Technical Team, Vendor, SME, and Decision Maker/PSM/Leadership.
- Added a War Room Bridge URL field with a Join button.
- Expanded timeline audit entries to include committed overview changes, incident detail updates, action edits, and War Room updates.
- Expanded HTML and text incident reports to include overview, incident details, actions, War Room information, and timeline.
- Updated report overview and footer identifiers to use the user-entered Incident No when present.

### Added

- Persistent storage for expanded incident details, richer action metadata, War Room bridge URL, and grouped War Room participants.

## 2026-07-04

### Changed

- Updated README and wiki documentation to reflect the current PowerShell-only runtime and completed review fixes.
- Added server-side schema validation before `start.ps1` writes PUT `/api/data` payloads to `mi-data.json`.
- Handled blocked report print popups with a user-facing toast instead of an uncaught error.
- Loaded communication templates independently so one missing template file no longer drops all templates to fallback.

## 2026-07-03

### Changed

- Documented MI Command as a PowerShell-driven local app.
- Updated the README with setup, team mode, storage behavior, template editing, project structure, and development notes.
- Renamed the browser server-backed storage mode from `file-api` to `powershell-api` to match the supported runtime.
- Updated team sync polling to reconcile remote content changes even when the remote revision is lower than the local revision.
- Hardened data normalization so imported, linked, and server-loaded incidents always include the nested fields the UI expects.
- Enforced adjacent incident status transitions and added an explicit reopen path from Resolved back to Monitoring.
- Added timeline audit entries when actions are added, closed, reopened, or deleted.
- Refreshed the Timeline panel immediately after action changes so action audit entries appear without tab changes or page reloads.
- Hardened PowerShell static-file path checks with a canonical root boundary comparison.
- Reworked team sync to merge timeline entries, action records, and overview fields without whole-incident last-write-wins overwrites.

### Removed

- Removed the Python local server entry point.
- Removed the Unix shell launcher that depended on Python.
- Removed generated Python cache artifacts from the project.

### Notes

- The supported app launch path is now `start.bat` or `start.ps1`.
- Direct `index.html` usage remains available as a fallback with browser storage or a linked JSON file.
