const Report = (() => {
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
      .timeline-table td {
        padding: 12px;
        border-bottom: 1px solid #eef0f4;
        vertical-align: top;
      }
      .timeline-table tr:last-child td { border-bottom: none; }
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
      ['Initial Assessment', incident.description],
      ['Root Cause', incident.rootCause],
      ['Resolution Summary', incident.resolution],
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

  function buildDocument(incident, settings, helpers) {
    const org = settings.orgName || 'Organisation';
    const generated = helpers.formatDateTime(new Date().toISOString());

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
  ${buildTimeline(incident, helpers)}
  <footer class="report-footer">
    MI Command · ${escapeHtml(incident.id)} · Confidential
  </footer>
</body>
</html>`;
  }

  function overviewFields(incident, helpers) {
    const status = helpers.statusLabels[incident.status] || incident.status;
    return [
      ['Incident ID', incident.id],
      ['Priority', Labels.priorityFull(incident.priority)],
      ['Severity', Labels.severityFull(incident.severity)],
      ['Status', status],
      ['Business Impact', helpers.capitalize(incident.impact)],
      ['Declared', helpers.formatDateTime(incident.createdAt)],
      ['Resolved', incident.resolvedAt ? helpers.formatDateTime(incident.resolvedAt) : '—'],
      ['Duration', helpers.formatDuration(incident.createdAt, incident.resolvedAt)],
      ['Major Incident Manager', incident.commander || '—'],
      ['Affected Services', incident.services || '—'],
    ];
  }

  function buildTextDocument(incident, settings, helpers) {
    const org = settings.orgName || 'Organisation';
    const generated = helpers.formatDateTime(new Date().toISOString());
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
      ['Initial Assessment', incident.description],
      ['Root Cause', incident.rootCause],
      ['Resolution Summary', incident.resolution],
    ];

    for (const [label, value] of textBlocks) {
      lines.push('');
      lines.push(label);
      lines.push(section);
      lines.push(value?.trim() || 'Not recorded');
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
    lines.push(`MI Command · ${incident.id} · Confidential`);
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
