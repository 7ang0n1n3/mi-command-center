const Report = (() => {
  const DETAIL_FIELDS = [
    { key: 'incidentNo', label: 'Incident No', type: 'text' },
    { key: 'priority', label: 'Priority', type: 'priority' },
    { key: 'downTime', label: 'Down Time JST', type: 'datetime' },
    { key: 'raised', label: 'Incident Raised Date & Time', type: 'datetime' },
    { key: 'priorityJust', label: 'Priority Justification', type: 'text' },
    { key: 'upgraded', label: 'Incident Upgraded Time JST', type: 'datetime' },
    { key: 'detection', label: 'Detection Time', type: 'datetime' },
    { key: 'upTime', label: 'Up Time JST', type: 'datetime' },
    { key: 'reportTime', label: 'Report Time JST', type: 'datetime' },
    { key: 'reportedBy', label: 'Reported By', type: 'text' },
    { key: 'bridgeOpen', label: 'Bridge Open Time JST', type: 'datetime' },
    { key: 'detectedMon', label: 'Detected By Monitoring', type: 'text' },
    { key: 'bridgeClosed', label: 'Bridge Closed Time JST', type: 'datetime' },
    { key: 'impServices', label: 'Impacted Services', type: 'textarea' },
    { key: 'impCompany', label: 'Impacted Company', type: 'text' },
    { key: 'impUsers', label: 'Impacted Users', type: 'text' },
    { key: 'ci', label: 'CI', type: 'textarea' },
    { key: 'problemTk', label: 'Problem Ticket', type: 'text' },
    { key: 'changeTk', label: 'Change Ticket', type: 'text' },
  ];

  const WAR_ROOM_GROUPS = [
    ['mim', 'MIM'],
    ['technicalTeam', 'Technical Team'],
    ['vendor', 'Vendor'],
    ['sme', 'SME'],
    ['leadership', 'Decision Maker/PSM/Leadership'],
  ];

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function buildStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: #1a1d26;
        background: #fff;
        line-height: 1.5;
        padding: 48px;
        max-width: 820px;
        margin: 0 auto;
      }
      .report-header {
        border-bottom: 3px solid #1a1d26;
        padding-bottom: 20px;
        margin-bottom: 32px;
      }
      .report-header h1 {
        font-size: 1.6rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 6px;
      }
      .report-meta {
        font-size: 0.85rem;
        color: #5c6378;
      }
      .incident-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin-top: 16px;
        color: #111;
      }
      section { margin-bottom: 36px; }
      h2 {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #5c6378;
        border-bottom: 1px solid #e2e5ec;
        padding-bottom: 8px;
        margin-bottom: 16px;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 24px;
        margin-bottom: 20px;
      }
      .summary-item label {
        display: block;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #8b92a8;
        margin-bottom: 2px;
      }
      .summary-item span {
        font-size: 0.95rem;
        font-weight: 500;
      }
      .text-block {
        margin-bottom: 16px;
      }
      .text-block label {
        display: block;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #8b92a8;
        margin-bottom: 6px;
      }
      .text-block p {
        font-size: 0.95rem;
        color: #333;
        white-space: pre-wrap;
      }
      .timeline-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      .details-table,
      .actions-table,
      .war-room-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
        margin-bottom: 20px;
      }
      .actions-table,
      .war-room-table {
        font-size: 0.82rem;
      }
      .details-table th,
      .actions-table th,
      .war-room-table th,
      .timeline-table th {
        text-align: left;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #8b92a8;
        padding: 10px 12px;
        border-bottom: 2px solid #e2e5ec;
        white-space: nowrap;
      }
      .details-table td,
      .actions-table td,
      .war-room-table td,
      .timeline-table td {
        padding: 12px;
        border-bottom: 1px solid #eef0f4;
        vertical-align: top;
      }
      .details-table tr:last-child td,
      .actions-table tr:last-child td,
      .war-room-table tr:last-child td,
      .timeline-table tr:last-child td { border-bottom: none; }
      .details-label {
        width: 220px;
        color: #5c6378;
        font-weight: 600;
      }
      .details-value {
        color: #333;
        white-space: pre-wrap;
      }
      .timeline-time {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 0.8rem;
        color: #5c6378;
        white-space: nowrap;
        width: 140px;
      }
      .timeline-author {
        font-size: 0.8rem;
        font-weight: 600;
        color: #2563eb;
        width: 100px;
      }
      .timeline-text { color: #333; }
      .group-title {
        font-size: 0.95rem;
        font-weight: 700;
        margin: 18px 0 8px;
      }
      .empty { color: #8b92a8; font-style: italic; }
      .report-footer {
        margin-top: 40px;
        padding-top: 16px;
        border-top: 1px solid #e2e5ec;
        font-size: 0.75rem;
        color: #8b92a8;
      }
      @media print {
        body { padding: 24px; }
        section { page-break-inside: avoid; }
      }
    `;
  }

  function buildOverview(incident, helpers) {
    const fields = overviewFields(incident, helpers);

    const grid = fields.map(([label, value]) => `
      <div class="summary-item">
        <label>${escapeHtml(label)}</label>
        <span>${escapeHtml(String(value))}</span>
      </div>`).join('');

    const textBlocks = [
      ['Short Description', incident.description],
      ['Error', incident.errorSummary],
      ['Business Impact', incident.businessImpact],
      ['Root Cause', incident.rootCause],
      ['Resolution', incident.resolution],
      ['Next Action Item', incident.nextAction],
    ].map(([label, value]) => `
      <div class="text-block">
        <label>${escapeHtml(label)}</label>
        <p>${value ? escapeHtml(value) : '<span class="empty">Not recorded</span>'}</p>
      </div>`).join('');

    return `
      <section>
        <h2>Overview</h2>
        <div class="summary-grid">${grid}</div>
        ${textBlocks}
      </section>`;
  }

  function buildDetails(incident) {
    const rows = detailFields(incident).map(([label, value]) => `
      <tr>
        <td class="details-label">${escapeHtml(label)}</td>
        <td class="details-value">${value ? escapeHtml(String(value)) : '<span class="empty">Not recorded</span>'}</td>
      </tr>`).join('');

    return `
      <section>
        <h2>Incident Details</h2>
        <table class="details-table">
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  function buildTimeline(incident, helpers) {
    const entries = [...(incident.timeline || [])].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    if (entries.length === 0) {
      return `
        <section>
          <h2>Timeline</h2>
          <p class="empty">No timeline entries recorded.</p>
        </section>`;
    }

    const rows = entries.map((e) => `
      <tr>
        <td class="timeline-time">${escapeHtml(helpers.formatDateTime(e.timestamp))}</td>
        <td class="timeline-author">${escapeHtml(e.author || '—')}</td>
        <td class="timeline-text">${escapeHtml(e.text)}</td>
      </tr>`).join('');

    return `
      <section>
        <h2>Timeline</h2>
        <table class="timeline-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Author</th>
              <th>Entry</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  function buildActions(incident) {
    const actions = (incident.actions || []).filter((action) => !action.deleted);
    if (!actions.length) {
      return `
        <section>
          <h2>Actions</h2>
          <p class="empty">No action items recorded.</p>
        </section>`;
    }

    const rows = actions.map((action, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(action.startText || formatActionTime(action.startedAt))}</td>
        <td>${escapeHtml(action.endText || formatActionTime(action.endedAt))}</td>
        <td>${escapeHtml(action.text || '')}</td>
        <td>${escapeHtml(action.owner || '')}</td>
        <td>${escapeHtml(actionStatusLabel(action))}</td>
        <td>${escapeHtml(action.update || '')}</td>
      </tr>`).join('');

    return `
      <section>
        <h2>Actions</h2>
        <table class="actions-table">
          <thead>
            <tr><th>SL</th><th>Start</th><th>End</th><th>Action</th><th>Owner</th><th>Status</th><th>Update</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  function buildWarRoom(incident) {
    const bridge = incident.warRoomBridgeUrl || '';
    const groupHtml = WAR_ROOM_GROUPS.map(([key, label]) => {
      const entries = warRoomEntries(incident, key);
      if (!entries.length) return '';
      const rows = entries.map((entry, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.name || '')}</td>
          <td>${escapeHtml(entry.role || '')}</td>
        </tr>`).join('');
      return `
        <p class="group-title">${escapeHtml(label)}</p>
        <table class="war-room-table">
          <thead><tr><th>SL</th><th>Name</th><th>Role</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

    return `
      <section>
        <h2>War Room</h2>
        <div class="text-block">
          <label>Bridge URL</label>
          <p>${bridge ? escapeHtml(bridge) : '<span class="empty">Not recorded</span>'}</p>
        </div>
        ${groupHtml || '<p class="empty">No War Room participants recorded.</p>'}
      </section>`;
  }

  function buildDocument(incident, settings, helpers) {
    const org = settings.orgName || 'Organisation';
    const generated = helpers.formatDateTime(new Date().toISOString());
    const reportId = incident.details?.incidentNo || incident.id;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MI Report — ${escapeHtml(incident.title)}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  <header class="report-header">
    <h1>Major Incident Report</h1>
    <p class="report-meta">${escapeHtml(org)} · Generated ${escapeHtml(generated)}</p>
    <p class="incident-title">${escapeHtml(incident.title)}</p>
  </header>
  ${buildOverview(incident, helpers)}
  ${buildDetails(incident)}
  ${buildActions(incident)}
  ${buildWarRoom(incident)}
  ${buildTimeline(incident, helpers)}
  <footer class="report-footer">
    MI Command · ${escapeHtml(reportId)} · Confidential
  </footer>
</body>
</html>`;
  }

  function overviewFields(incident, helpers) {
    const status = helpers.statusLabels[incident.status] || incident.status;
    return [
      ['Incident ID', incident.details?.incidentNo || incident.id],
      ['Priority', Labels.priorityFull(incident.priority)],
      ['Severity', Labels.severityFull(incident.severity)],
      ['Status', status],
      ['Impact Scope', helpers.capitalize(incident.impact)],
      ['Impacted Company', incident.details?.impCompany || '—'],
      ['Declared', helpers.formatDateTime(incident.createdAt)],
      ['Resolved', incident.resolvedAt ? helpers.formatDateTime(incident.resolvedAt) : '—'],
      ['Duration', helpers.formatDuration(incident.createdAt, incident.resolvedAt)],
      ['Major Incident Manager', incident.commander || '—'],
      ['Affected Services', incident.services || '—'],
    ];
  }

  function detailFields(incident) {
    return DETAIL_FIELDS.map((field) => [field.label, detailValue(incident, field)]);
  }

  function detailValue(incident, field) {
    const details = incident.details || {};
    if (field.key === 'incidentNo') return details.incidentNo || incident.id;
    if (field.key === 'priority') return prioritySeverityLabel(details.priority, incident);
    if (field.key === 'impServices') return details.impServices || incident.services || '';
    if (field.type === 'datetime') return formatDetailDateTime(details[field.key]);
    return details[field.key] || '';
  }

  function prioritySeverityLabel(value, incident) {
    const raw = value || `${incident.priority}|${incident.severity}`;
    const [priority, severity] = raw.split('|');
    return `${Labels.priorityFull(priority)} - ${Labels.severityFull(severity)}`;
  }

  function formatDetailDateTime(value) {
    if (!value || typeof value !== 'object') return '';
    const date = value.date || '';
    const time = value.time || '';
    if (!date && !time) return '';
    return `${date || 'No date'} ${time || 'HH:MM'} JST`;
  }

  function actionStatusLabel(action) {
    const status = action.status || (action.done ? 'completed' : 'in-progress');
    const labels = {
      'in-progress': 'In Progress',
      completed: 'Completed',
      kiv: 'KIV',
    };
    return labels[status] || status;
  }

  function formatActionTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function warRoomEntries(incident, group) {
    return (incident.warRoom?.[group] || []).filter((entry) => entry.name || entry.role);
  }

  function buildTextDocument(incident, settings, helpers) {
    const org = settings.orgName || 'Organisation';
    const generated = helpers.formatDateTime(new Date().toISOString());
    const reportId = incident.details?.incidentNo || incident.id;
    const line = '═'.repeat(72);
    const section = '─'.repeat(72);
    const lines = [];

    lines.push(line);
    lines.push('MAJOR INCIDENT REPORT');
    lines.push(line);
    lines.push('');
    lines.push(`Organisation : ${org}`);
    lines.push(`Generated    : ${generated}`);
    lines.push(`Incident     : ${incident.title}`);
    lines.push('');
    lines.push('OVERVIEW');
    lines.push(section);

    const labelWidth = 26;
    for (const [label, value] of overviewFields(incident, helpers)) {
      lines.push(`${label.padEnd(labelWidth)}: ${value || '—'}`);
    }

    const textBlocks = [
      ['Short Description', incident.description],
      ['Error', incident.errorSummary],
      ['Business Impact', incident.businessImpact],
      ['Root Cause', incident.rootCause],
      ['Resolution', incident.resolution],
      ['Next Action Item', incident.nextAction],
    ];

    for (const [label, value] of textBlocks) {
      lines.push('');
      lines.push(label);
      lines.push(section);
      lines.push(value?.trim() || 'Not recorded');
    }

    lines.push('');
    lines.push('INCIDENT DETAILS');
    lines.push(section);
    for (const [label, value] of detailFields(incident)) {
      lines.push(`${label.padEnd(labelWidth)}: ${value || '—'}`);
    }

    lines.push('');
    lines.push('ACTIONS');
    lines.push(section);
    const actions = (incident.actions || []).filter((action) => !action.deleted);
    if (!actions.length) {
      lines.push('No action items recorded.');
    } else {
      actions.forEach((action, index) => {
        lines.push(`${String(index + 1).padEnd(3)} ${actionStatusLabel(action).padEnd(12)} ${action.text || '—'}`);
        lines.push(`    Start : ${action.startText || formatActionTime(action.startedAt) || '—'}`);
        lines.push(`    End   : ${action.endText || formatActionTime(action.endedAt) || '—'}`);
        lines.push(`    Owner : ${action.owner || '—'}`);
        lines.push(`    Update: ${action.update || '—'}`);
      });
    }

    lines.push('');
    lines.push('WAR ROOM');
    lines.push(section);
    lines.push(`Bridge URL`.padEnd(labelWidth) + `: ${incident.warRoomBridgeUrl || '—'}`);
    for (const [key, label] of WAR_ROOM_GROUPS) {
      const entries = warRoomEntries(incident, key);
      lines.push('');
      lines.push(label);
      if (!entries.length) {
        lines.push('  No participants recorded.');
      } else {
        entries.forEach((entry, index) => {
          lines.push(`  ${index + 1}. ${entry.name || '—'}${entry.role ? ` - ${entry.role}` : ''}`);
        });
      }
    }

    lines.push('');
    lines.push('TIMELINE');
    lines.push(section);

    const entries = [...(incident.timeline || [])].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    if (entries.length === 0) {
      lines.push('No timeline entries recorded.');
    } else {
      entries.forEach((e, i) => {
        if (i > 0) lines.push('');
        const author = e.author ? ` (${e.author})` : '';
        lines.push(`[${helpers.formatDateTime(e.timestamp)}]${author}`);
        lines.push(`  ${e.text}`);
      });
    }

    lines.push('');
    lines.push(line);
    lines.push(`MI Command · ${reportId} · Confidential`);
    lines.push(line);

    return `${lines.join('\n')}\n`;
  }

  function buildFilename(incident, ext) {
    const slug = incident.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    const id = incident.id.replace(/[^a-zA-Z0-9-]/g, '');
    return `MI-Report-${id}${slug ? `-${slug}` : ''}-${date}.${ext}`;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function download(incident, settings, helpers) {
    downloadBlob(
      buildDocument(incident, settings, helpers),
      buildFilename(incident, 'html'),
      'text/html;charset=utf-8'
    );
  }

  function downloadText(incident, settings, helpers) {
    downloadBlob(
      buildTextDocument(incident, settings, helpers),
      buildFilename(incident, 'txt'),
      'text/plain;charset=utf-8'
    );
  }

  function print(incident, settings, helpers) {
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.write(buildDocument(incident, settings, helpers));
    win.document.close();
    win.focus();
    win.print();
    return true;
  }

  return { download, downloadText, print, buildDocument, buildTextDocument };
})();
