# Changelog

All notable changes to MI Command are documented here.

This project follows a simple date-based changelog because it is distributed as a portable internal tool rather than a packaged release.

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
