const App = (() => {
  let data = Storage.load();
  let currentView = 'dashboard';
  let currentIncidentId = null;
  let currentTab = 'overview';
  let durationTimer = null;
  let userIsEditing = false;
  let pendingRemoteRefresh = false;
  let lastSyncAt = null;
  let overviewSaveTimer = null;

  const STATUS_LABELS = {
    declared: 'Declared',
    investigating: 'Investigating',
    mitigating: 'Mitigating',
    monitoring: 'Monitoring',
    resolved: 'Resolved',
  };

  const STATUS_ORDER = ['declared', 'investigating', 'mitigating', 'monitoring', 'resolved'];
  const STATUS_TRANSITIONS = {
    declared: ['investigating'],
    investigating: ['declared', 'mitigating'],
    mitigating: ['investigating', 'monitoring'],
    monitoring: ['mitigating', 'resolved'],
    resolved: ['monitoring'],
  };

  const PLAYBOOKS = [
    {
      title: 'Initial Declaration',
      description: 'First 15 minutes after detecting a major incident.',
      steps: [
        'Confirm incident meets MI criteria',
        'Declare MI and assign Major Incident Manager (MIM)',
        'Open war room bridge / conference line',
        'Notify executive stakeholders and comms team',
        'Create incident record and start timeline',
        'Assign technical investigation lead',
      ],
    },
    {
      title: 'Investigation Phase',
      description: 'Identify root cause and scope of impact.',
      steps: [
        'Gather symptoms from monitoring and users',
        'Identify affected services and dependencies',
        'Form hypothesis and assign investigation tasks',
        'Document findings in timeline',
        'Assess customer and business impact',
        'Determine if vendor escalation is needed',
      ],
    },
    {
      title: 'Mitigation & Recovery',
      description: 'Restore service and reduce customer impact.',
      steps: [
        'Implement workaround or fix',
        'Validate service restoration in monitoring',
        'Confirm with affected business units',
        'Send recovery communication to stakeholders',
        'Move to monitoring phase',
        'Schedule post-incident review',
      ],
    },
    {
      title: 'Communications',
      description: 'Keep stakeholders informed throughout.',
      steps: [
        'Initial notification within 30 minutes',
        'Regular updates every 30–60 minutes',
        'Include: impact, actions taken, ETA if known',
        'Coordinate messaging through Comms Lead',
        'Prepare all-clear / resolution notice',
        'Archive all communications in incident record',
      ],
    },
  ];

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function prioritySeverityBadges(incident) {
    return `<span class="badge-group">
      <span class="badge ${Labels.priorityBadgeClass(incident.priority)}">${Labels.priorityLabel(incident.priority)}</span>
      <span class="badge ${Labels.severityBadgeClass(incident.severity)}">${Labels.severityLabel(incident.severity)}</span>
    </span>`;
  }

  function buildPriorityOptions(selected) {
    return Labels.PRIORITIES.map((p) =>
      `<option value="${p}" ${p === selected ? 'selected' : ''}>${Labels.PRIORITY_DESCRIPTIONS[p]}</option>`
    ).join('');
  }

  function buildSeverityOptions(selected) {
    return Labels.SEVERITIES.map((s) =>
      `<option value="${s}" ${s === selected ? 'selected' : ''}>${Labels.SEVERITY_DESCRIPTIONS[s]}</option>`
    ).join('');
  }

  function canTransition(from, to) {
    return from === to || (STATUS_TRANSITIONS[from] || []).includes(to);
  }

  async function init() {
    await Storage.init(updateStorageStatus, handleRemoteUpdate);
    await Comms.load();
    data = Storage.load();
    bindNavigation();
    bindDeclareForm();
    bindSettings();
    bindTabs();
    bindEditingGuards();
    updateClock();
    setInterval(updateClock, 1000);
    render();
  }

  function bindEditingGuards() {
    const main = $('.main-content');
    main.addEventListener('focusin', (e) => {
      if (e.target.matches('input, textarea, select')) userIsEditing = true;
      updateSyncStatus();
    });
    main.addEventListener('focusout', () => {
      setTimeout(() => {
        const active = document.activeElement;
        userIsEditing = !!(active && main.contains(active) && active.matches('input, textarea, select'));
        updateSyncStatus();
        if (!userIsEditing && pendingRemoteRefresh) {
          pendingRemoteRefresh = false;
          applyRemoteRefresh();
        }
      }, 0);
    });
  }

  function handleRemoteUpdate(info) {
    if (info.source === 'error') {
      setSyncLabel('Sync paused', 'paused');
      return;
    }
    lastSyncAt = Date.now();
    if (userIsEditing) {
      pendingRemoteRefresh = true;
      setSyncLabel('Update waiting…', 'paused');
      return;
    }
    applyRemoteRefresh(true);
  }

  function applyRemoteRefresh(showToast = false) {
    data = Storage.load();
    if (currentView === 'settings') {
      $('#org-name').value = data.settings.orgName || '';
      $('#bridge-number').value = data.settings.bridgeNumber || '';
    }
    render();
    setSyncLabel('Live · team sync', 'live');
    if (showToast) toast('Updated from team', 'success');
  }

  function updateSyncStatus() {
    const info = Storage.getStorageInfo();
    const el = $('#sync-status');
    if (!info.syncEnabled) {
      el?.classList.add('hidden');
      return;
    }
    el?.classList.remove('hidden');
    if (userIsEditing) setSyncLabel('Editing — sync paused', 'paused');
    else if (Storage.isPersisting()) setSyncLabel('Saving…', 'syncing');
    else setSyncLabel('Live · team sync', 'live');
  }

  function setSyncLabel(text, state = 'live') {
    const el = $('#sync-status');
    const label = $('#sync-label');
    if (!el || !label) return;
    el.classList.remove('hidden', 'live', 'syncing', 'paused');
    el.classList.add(state);
    label.textContent = text;
  }

  function updateStorageStatus(info) {
    const badge = $('#storage-status');
    if (!badge) return;

    if (info.mode === 'powershell-api') {
      badge.className = 'offline-badge';
      badge.innerHTML = `<span class="pulse"></span> Team mode · ${esc(info.fileName)}`;
      updateSyncStatus();
    } else if (info.mode === 'fs-access') {
      badge.className = 'offline-badge';
      badge.innerHTML = `<span class="pulse"></span> Saving to ${esc(info.fileName)}`;
    } else {
      badge.className = 'offline-badge warning';
      badge.innerHTML = '<span class="pulse"></span> Browser only — link a data file';
    }

    renderDataFilePanel();
  }

  function renderDataFilePanel() {
    const info = Storage.getStorageInfo();
    const label = $('#data-file-label');
    const hint = $('#data-file-hint');
    const actions = $('#data-file-actions');
    if (!label) return;

    if (info.mode === 'powershell-api') {
      label.textContent = info.fileName;
      hint.textContent = 'Shared team file — auto-refreshes every few seconds without reloading the page.';
      actions.classList.add('hidden');
    } else if (info.mode === 'fs-access') {
      label.textContent = info.fileName;
      hint.textContent = 'Auto-saved to your linked file on every change.';
      actions.innerHTML = '<button class="btn btn-ghost btn-sm" id="btn-unlink-file">Stop using file</button>';
      $('#btn-unlink-file')?.addEventListener('click', unlinkDataFile);
    } else {
      label.textContent = 'No data file linked';
      hint.textContent = 'Run start.bat (Windows) for automatic mi-data.json, or link/create a file below.';
      actions.classList.remove('hidden');
      actions.innerHTML = `
        <button class="btn btn-secondary" id="btn-link-file">Open Data File</button>
        <button class="btn btn-secondary" id="btn-create-file">Create Data File</button>`;
      $('#btn-link-file')?.addEventListener('click', linkDataFile);
      $('#btn-create-file')?.addEventListener('click', createDataFile);
    }
  }

  function bindNavigation() {
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) navigate(view);
      });
    });

    $('#btn-declare-mi').addEventListener('click', () => openDeclareModal());
    $('#btn-view-all').addEventListener('click', () => navigate('incidents'));
  }

  function bindDeclareForm() {
    const modal = $('#modal-declare');
    const form = $('#form-declare');

    $$('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('dialog')?.close();
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const incident = Storage.createIncident({
        title: $('#mi-title').value.trim(),
        priority: $('#mi-priority').value,
        severity: $('#mi-severity').value,
        impact: $('#mi-impact').value,
        services: $('#mi-services').value.trim(),
        description: $('#mi-description').value.trim(),
        commander: $('#mi-commander').value.trim(),
      });
      data = Storage.load();
      Storage.upsertIncident(data, incident);
      data = Storage.load();
      modal.close();
      form.reset();
      toast('Major Incident declared', 'success');
      openIncident(incident.id);
    });
  }

  function bindSettings() {
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#btn-clear').addEventListener('click', clearData);
    $('#btn-export-report').addEventListener('click', exportIncidentReport);
    $('#btn-export-report-txt').addEventListener('click', exportIncidentReportText);
    $('#btn-print').addEventListener('click', printReport);
    $('#btn-link-file')?.addEventListener('click', linkDataFile);
    $('#btn-create-file')?.addEventListener('click', createDataFile);

    $('#org-name').value = data.settings.orgName || '';
    $('#bridge-number').value = data.settings.bridgeNumber || '';

    $('#org-name').addEventListener('change', saveSettings);
    $('#bridge-number').addEventListener('change', saveSettings);
  }

  async function linkDataFile() {
    try {
      const result = await Storage.linkExistingFile();
      data = Storage.load();
      toast(`Linked ${result.fileName}`, 'success');
      render();
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message, 'error');
    }
  }

  async function createDataFile() {
    try {
      const result = await Storage.createNewFile();
      data = Storage.load();
      toast(`Created ${result.fileName}`, 'success');
      render();
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message, 'error');
    }
  }

  async function unlinkDataFile() {
    await Storage.unlinkFile();
    data = Storage.load();
    toast('Data file unlinked — using browser storage', 'success');
    render();
  }

  function bindTabs() {
    $$('.detail-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        $$('.detail-tabs .tab').forEach((t) => t.classList.remove('active'));
        $$('.tab-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${currentTab}`).classList.add('active');
      });
    });
  }

  function restoreActiveTab() {
    $$('.detail-tabs .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
    $$('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${currentTab}`);
    });
  }

  function saveSettings() {
    data.settings.orgName = $('#org-name').value.trim();
    data.settings.bridgeNumber = $('#bridge-number').value.trim();
    data = Storage.save(data);
  }

  function navigate(view) {
    currentView = view;
    if (view !== 'detail') {
      currentIncidentId = null;
      stopDurationTimer();
      $('#btn-export-report').disabled = true;
      $('#btn-export-report-txt').disabled = true;
      $('#btn-print').disabled = true;
    }

    $$('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.view === view || (view === 'detail' && n.dataset.view === 'incidents'));
    });

    $$('.view').forEach((v) => v.classList.remove('active'));

    const titles = {
      dashboard: ['Dashboard', 'Service Desk command centre'],
      incidents: ['All Incidents', 'Browse and search incident history'],
      detail: ['Incident Detail', ''],
      templates: ['Playbooks', 'Standard operating procedures for major incidents'],
      settings: ['Data & Settings', 'Backup, restore, and organisation settings'],
    };

    if (view === 'detail') {
      $('#view-detail').classList.add('active');
      $('#page-title').textContent = 'Incident Detail';
      $('#page-subtitle').textContent = currentIncidentId || '';
    } else {
      $(`#view-${view}`).classList.add('active');
      const [title, subtitle] = titles[view] || ['', ''];
      $('#page-title').textContent = title;
      $('#page-subtitle').textContent = subtitle;
    }

    render();
  }

  function openDeclareModal() {
    const modal = $('#modal-declare');
    modal.showModal();
    $('#mi-title').focus();
  }

  function openIncident(id) {
    currentIncidentId = id;
    navigate('detail');
    $('#btn-export-report').disabled = false;
    $('#btn-export-report-txt').disabled = false;
    $('#btn-print').disabled = false;
    startDurationTimer();
  }

  function render() {
    switch (currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'incidents': renderIncidentsList(); break;
      case 'detail': renderDetail(); break;
      case 'templates': renderPlaybooks(); break;
      case 'settings': renderDataFilePanel(); break;
    }
  }

  function renderDashboard() {
    const incidents = Storage.getIncidents(data);
    const active = incidents.filter(Storage.isActive);

    $('#stat-active').textContent = active.length;
    $('#stat-investigating').textContent = incidents.filter((i) => i.status === 'investigating').length;

    const today = new Date().toDateString();
    $('#stat-resolved-today').textContent = incidents.filter(
      (i) => i.status === 'resolved' && i.resolvedAt && new Date(i.resolvedAt).toDateString() === today
    ).length;

    const openActions = active.reduce((sum, i) => sum + (i.actions?.filter((a) => !a.deleted && !a.done).length || 0), 0);
    $('#stat-open-actions').textContent = openActions;

    const list = $('#active-incidents-list');
    const empty = $('#no-active-msg');

    if (active.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = active.map(renderIncidentCard).join('');
      list.querySelectorAll('.incident-card').forEach((card) => {
        card.addEventListener('click', () => openIncident(card.dataset.id));
      });
    }

    renderRecentActivity(incidents);
  }

  function renderIncidentCard(incident) {
    const statusClass = `badge-${incident.status}`;
    return `
      <div class="incident-card" data-id="${incident.id}">
        <div class="incident-card-header">
          <h4>${esc(incident.title)}</h4>
          ${prioritySeverityBadges(incident)}
        </div>
        <div class="incident-meta">
          <span class="badge ${statusClass}">${STATUS_LABELS[incident.status]}</span>
          <span class="incident-duration">${formatDuration(incident.createdAt)}</span>
        </div>
        ${incident.services ? `<div class="incident-services">${esc(incident.services)}</div>` : ''}
      </div>`;
  }

  function renderRecentActivity(incidents) {
    const entries = [];
    for (const inc of incidents) {
      for (const entry of inc.timeline || []) {
        entries.push({ ...entry, incidentTitle: inc.title, incidentId: inc.id });
      }
    }
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recent = entries.slice(0, 10);

    const feed = $('#recent-activity');
    if (recent.length === 0) {
      feed.innerHTML = '<div class="empty-state"><p class="text-muted">No activity yet</p></div>';
      return;
    }

    feed.innerHTML = recent.map((e) => `
      <div class="activity-item" data-id="${e.incidentId}" style="cursor:pointer">
        <span class="activity-time">${formatTime(e.timestamp)}</span>
        <span class="activity-dot"></span>
        <span class="activity-text"><strong>${esc(e.incidentTitle)}</strong> — ${esc(e.text)}</span>
      </div>
    `).join('');

    feed.querySelectorAll('.activity-item').forEach((item) => {
      item.addEventListener('click', () => openIncident(item.dataset.id));
    });
  }

  function renderIncidentsList() {
    const search = ($('#incident-search')?.value || '').toLowerCase();
    const filter = $('#filter-status')?.value || 'all';

    let incidents = Storage.getIncidents(data);

    if (filter === 'active') {
      incidents = incidents.filter(Storage.isActive);
    } else if (filter !== 'all') {
      incidents = incidents.filter((i) => i.status === filter);
    }

    if (search) {
      incidents = incidents.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.id.toLowerCase().includes(search) ||
          (i.services || '').toLowerCase().includes(search)
      );
    }

    incidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const wrap = $('#all-incidents-list');
    if (incidents.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><p>No incidents found</p></div>';
      return;
    }

    wrap.innerHTML = `
      <table class="incident-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Declared</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${incidents.map((i) => `
            <tr data-id="${i.id}">
              <td><code>${esc(i.id)}</code></td>
              <td>${esc(i.title)}</td>
              <td><span class="badge ${Labels.priorityBadgeClass(i.priority)}">${Labels.priorityLabel(i.priority)}</span></td>
              <td><span class="badge ${Labels.severityBadgeClass(i.severity)}">${Labels.severityLabel(i.severity)}</span></td>
              <td><span class="badge badge-${i.status}">${STATUS_LABELS[i.status]}</span></td>
              <td>${formatDateTime(i.createdAt)}</td>
              <td class="incident-duration">${formatDuration(i.createdAt, i.resolvedAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', () => openIncident(row.dataset.id));
    });

    if (!$('#incident-search')._bound) {
      $('#incident-search').addEventListener('input', () => renderIncidentsList());
      $('#filter-status').addEventListener('change', () => renderIncidentsList());
      $('#incident-search')._bound = true;
    }
  }

  function renderDetail() {
    const incident = Storage.getIncident(data, currentIncidentId);
    if (!incident) {
      navigate('incidents');
      return;
    }

    $('#page-subtitle').textContent = incident.id;

    const isResolved = incident.status === 'resolved';

    $('#detail-header').innerHTML = `
      <div class="detail-header-top">
        <div>
          <h2>${esc(incident.title)}</h2>
          <div class="detail-meta-row" style="margin-top:12px">
            <div class="detail-meta-item">
              <span>Priority</span>
              <span data-meta="priority" class="badge ${Labels.priorityBadgeClass(incident.priority)}">${Labels.priorityLabel(incident.priority)}</span>
            </div>
            <div class="detail-meta-item">
              <span>Severity</span>
              <span data-meta="severity" class="badge ${Labels.severityBadgeClass(incident.severity)}">${Labels.severityLabel(incident.severity)}</span>
            </div>
            <div class="detail-meta-item">
              <span>Status</span>
              <span class="badge badge-status badge-${incident.status}">${STATUS_LABELS[incident.status]}</span>
            </div>
            <div class="detail-meta-item">
              <span>Impact</span>
              <span>${esc(capitalize(incident.impact))}</span>
            </div>
            <div class="detail-meta-item">
              <span>Duration</span>
              <span class="duration-live" id="live-duration">${formatDuration(incident.createdAt, incident.resolvedAt)}</span>
            </div>
            <div class="detail-meta-item">
              <span>MIM</span>
              <span data-meta="mim">${esc(incident.commander || '—')}</span>
            </div>
          </div>
        </div>
        <div class="detail-header-actions">
          <button class="btn btn-secondary btn-sm" id="btn-export-report-detail">Export HTML</button>
          <button class="btn btn-ghost btn-sm" id="btn-export-report-txt-detail">Export Text</button>
          ${isResolved
            ? '<button class="btn btn-primary btn-sm" id="btn-reopen">Reopen</button>'
            : `<button class="btn btn-primary btn-sm" id="btn-resolve" ${canTransition(incident.status, 'resolved') ? '' : 'disabled'}>Mark Resolved</button>`}
          <button class="btn btn-ghost btn-sm" id="btn-delete-mi">Delete</button>
        </div>
      </div>`;

    $('#btn-export-report-detail')?.addEventListener('click', exportIncidentReport);
    $('#btn-export-report-txt-detail')?.addEventListener('click', exportIncidentReportText);
    $('#btn-resolve')?.addEventListener('click', () => resolveIncident(incident.id));
    $('#btn-reopen')?.addEventListener('click', () => reopenIncident(incident.id));
    $('#btn-delete-mi')?.addEventListener('click', () => confirmDelete(incident.id));

    if (userIsEditing && currentTab === 'overview') {
      renderOverviewHeader(incident);
    } else {
      renderOverview(incident);
    }
    if (!(userIsEditing && currentTab === 'timeline')) renderTimeline(incident);
    if (!(userIsEditing && currentTab === 'actions')) renderActions(incident);
    if (!(userIsEditing && currentTab === 'team')) renderTeam(incident);
    renderComms(incident);
    restoreActiveTab();
  }

  function renderOverviewHeader(incident) {
    const isResolved = incident.status === 'resolved';
    const statusEl = $('#detail-header .badge-status');
    if (statusEl) {
      statusEl.className = `badge badge-status badge-${incident.status}`;
      statusEl.textContent = STATUS_LABELS[incident.status];
    }
    const priorityEl = $('#detail-header [data-meta="priority"]');
    if (priorityEl) {
      priorityEl.className = `badge ${Labels.priorityBadgeClass(incident.priority)}`;
      priorityEl.textContent = Labels.priorityLabel(incident.priority);
    }
    const severityEl = $('#detail-header [data-meta="severity"]');
    if (severityEl) {
      severityEl.className = `badge ${Labels.severityBadgeClass(incident.severity)}`;
      severityEl.textContent = Labels.severityLabel(incident.severity);
    }
    const mimEl = $('#detail-header [data-meta="mim"]');
    if (mimEl) mimEl.textContent = incident.commander || '—';
    $('#btn-resolve')?.toggleAttribute('disabled', !canTransition(incident.status, 'resolved'));
    if (!isResolved && !$('#btn-resolve')) {
      $('.detail-header-actions')?.insertAdjacentHTML('afterbegin',
        `<button class="btn btn-primary btn-sm" id="btn-resolve" ${canTransition(incident.status, 'resolved') ? '' : 'disabled'}>Mark Resolved</button>`);
      $('#btn-resolve')?.addEventListener('click', () => resolveIncident(incident.id));
    }
  }

  function renderOverview(incident) {
    const panel = $('#tab-overview');
    panel.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card">
          <h4>Status Progression</h4>
          <div class="status-flow">
            ${STATUS_ORDER.map((s) => `
              <button class="status-btn ${incident.status === s ? 'current' : ''}" data-status="${s}" ${canTransition(incident.status, s) ? '' : 'disabled'}>
                ${STATUS_LABELS[s]}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="overview-card">
          <h4>Classification</h4>
          <div class="form-row" style="margin-bottom:0">
            <div class="form-group">
              <label for="ov-priority">Priority</label>
              <select id="ov-priority" class="select">${buildPriorityOptions(incident.priority)}</select>
            </div>
            <div class="form-group">
              <label for="ov-severity">Severity</label>
              <select id="ov-severity" class="select">${buildSeverityOptions(incident.severity)}</select>
            </div>
          </div>
        </div>
        <div class="overview-card">
          <h4>Affected Services</h4>
          <input type="text" class="input" id="ov-services" value="${esc(incident.services)}" placeholder="Comma-separated services">
        </div>
        <div class="overview-card" style="grid-column: 1 / -1">
          <h4>Initial Assessment</h4>
          <textarea class="textarea" id="ov-description" rows="3">${esc(incident.description)}</textarea>
        </div>
        <div class="overview-card">
          <h4>Root Cause</h4>
          <textarea class="textarea" id="ov-rootcause" rows="3" placeholder="Document root cause when known">${esc(incident.rootCause || '')}</textarea>
        </div>
        <div class="overview-card">
          <h4>Resolution Summary</h4>
          <textarea class="textarea" id="ov-resolution" rows="3" placeholder="How was the incident resolved?">${esc(incident.resolution || '')}</textarea>
        </div>
      </div>`;

    panel.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', () => updateStatus(incident.id, btn.dataset.status));
    });

    ['ov-priority', 'ov-severity'].forEach((id) => {
      $(`#${id}`)?.addEventListener('change', () => saveOverview(incident.id, true));
    });

    ['ov-services', 'ov-description', 'ov-rootcause', 'ov-resolution'].forEach((id) => {
      const el = $(`#${id}`);
      el?.addEventListener('input', () => scheduleOverviewSave(incident.id));
      el?.addEventListener('change', () => saveOverview(incident.id));
    });
  }

  function scheduleOverviewSave(id) {
    clearTimeout(overviewSaveTimer);
    overviewSaveTimer = setTimeout(() => saveOverview(id), 500);
  }

  function saveOverview(id, refreshHeader = false) {
    const incident = Storage.getIncident(data, id);
    if (!incident) return;
    const nextValues = {
      priority: $('#ov-priority')?.value || incident.priority,
      severity: $('#ov-severity')?.value || incident.severity,
      services: $('#ov-services')?.value.trim() ?? incident.services,
      description: $('#ov-description')?.value.trim() ?? incident.description,
      rootCause: $('#ov-rootcause')?.value.trim() ?? incident.rootCause,
      resolution: $('#ov-resolution')?.value.trim() ?? incident.resolution,
    };
    const changedAt = new Date().toISOString();
    incident.fieldUpdatedAt = incident.fieldUpdatedAt || {};
    for (const [field, value] of Object.entries(nextValues)) {
      if (incident[field] !== value) {
        incident[field] = value;
        incident.fieldUpdatedAt[field] = changedAt;
      }
    }
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    updateSyncStatus();
    if (refreshHeader) renderOverviewHeader(Storage.getIncident(data, id));
  }

  function updateStatus(id, status) {
    const incident = Storage.getIncident(data, id);
    if (!incident || incident.status === status) return;
    if (!canTransition(incident.status, status)) {
      toast(`Move from ${STATUS_LABELS[incident.status]} to ${STATUS_LABELS[status]} one step at a time`, 'error');
      return;
    }

    const oldStatus = incident.status;
    const reopened = oldStatus === 'resolved' && status !== 'resolved';
    const changedAt = new Date().toISOString();
    incident.fieldUpdatedAt = incident.fieldUpdatedAt || {};
    incident.status = status;
    incident.fieldUpdatedAt.status = changedAt;
    if (status === 'resolved') {
      incident.resolvedAt = changedAt;
      incident.fieldUpdatedAt.resolvedAt = changedAt;
    } else if (reopened) {
      incident.resolvedAt = null;
      incident.fieldUpdatedAt.resolvedAt = changedAt;
    }

    incident.timeline.push({
      id: Storage.generateId(),
      timestamp: new Date().toISOString(),
      author: 'System',
      text: reopened
        ? `Incident reopened from ${STATUS_LABELS[oldStatus]} to ${STATUS_LABELS[status]}`
        : `Status changed from ${STATUS_LABELS[oldStatus]} to ${STATUS_LABELS[status]}`,
      type: 'system',
    });

    Storage.upsertIncident(data, incident);
    data = Storage.load();
    toast(`Status updated to ${STATUS_LABELS[status]}`, 'success');
    renderDetail();
    if (status === 'resolved') stopDurationTimer();
    else if (reopened) startDurationTimer();
  }

  function resolveIncident(id) {
    updateStatus(id, 'resolved');
  }

  function reopenIncident(id) {
    updateStatus(id, 'monitoring');
  }

  function renderTimeline(incident) {
    const panel = $('#tab-timeline');
    const entries = [...(incident.timeline || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    panel.innerHTML = `
      <div class="timeline">
        ${entries.map((e) => `
          <div class="timeline-entry ${e.type || ''}">
            <div class="timeline-entry-header">
              <span class="timeline-entry-time">${formatDateTime(e.timestamp)}</span>
              ${e.author ? `<span class="timeline-entry-author">${esc(e.author)}</span>` : ''}
            </div>
            <div class="timeline-entry-text">${esc(e.text)}</div>
          </div>
        `).join('')}
      </div>
      <div class="timeline-add">
        <input type="text" class="input" id="timeline-input" placeholder="Add timeline entry…">
        <input type="text" class="input" id="timeline-author" placeholder="Your name" style="max-width:140px">
        <button class="btn btn-primary btn-sm" id="btn-add-timeline">Add</button>
      </div>`;

    $('#btn-add-timeline').addEventListener('click', () => addTimelineEntry(incident.id));
    $('#timeline-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTimelineEntry(incident.id);
    });
  }

  function addTimelineEntry(id) {
    const text = $('#timeline-input').value.trim();
    if (!text) return;

    const incident = Storage.getIncident(data, id);
    if (!incident) return;

    incident.timeline.push({
      id: Storage.generateId(),
      timestamp: new Date().toISOString(),
      author: $('#timeline-author').value.trim() || 'Analyst',
      text,
      type: 'user',
    });

    Storage.upsertIncident(data, incident);
    data = Storage.load();
    $('#timeline-input').value = '';
    renderTimeline(incident);
    toast('Timeline entry added', 'success');
  }

  function addActionTimelineEntry(incident, text) {
    incident.timeline.push({
      id: Storage.generateId(),
      timestamp: new Date().toISOString(),
      author: 'System',
      text,
      type: 'system',
    });
  }

  function describeAction(action) {
    return `"${action.text}"${action.owner ? ` (${action.owner})` : ''}`;
  }

  function refreshActionAndTimelinePanels(incidentId) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    renderActions(incident);
    renderTimeline(incident);
  }

  function renderActions(incident) {
    const panel = $('#tab-actions');
    const actions = (incident.actions || []).filter((a) => !a.deleted);

    panel.innerHTML = `
      <div class="action-list">
        ${actions.map((a) => `
          <div class="action-item ${a.done ? 'done' : ''}" data-action-id="${a.id}">
            <input type="checkbox" class="action-checkbox" ${a.done ? 'checked' : ''}>
            <span class="action-text">${esc(a.text)}</span>
            ${a.owner ? `<span class="action-owner">${esc(a.owner)}</span>` : ''}
            <button class="action-delete" title="Remove">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="action-add">
        <input type="text" class="input" id="action-input" placeholder="New action item…">
        <input type="text" class="input" id="action-owner" placeholder="Owner" style="max-width:120px">
        <button class="btn btn-primary btn-sm" id="btn-add-action">Add</button>
      </div>`;

    panel.querySelectorAll('.action-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const item = cb.closest('.action-item');
        toggleAction(incident.id, item.dataset.actionId, cb.checked);
      });
    });

    panel.querySelectorAll('.action-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.action-item');
        deleteAction(incident.id, item.dataset.actionId);
      });
    });

    $('#btn-add-action').addEventListener('click', () => addAction(incident.id));
    $('#action-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addAction(incident.id);
    });
  }

  function toggleAction(incidentId, actionId, done) {
    const incident = Storage.getIncident(data, incidentId);
    const action = incident?.actions?.find((a) => a.id === actionId);
    if (!action) return;
    action.done = done;
    action.updatedAt = new Date().toISOString();
    addActionTimelineEntry(
      incident,
      done
        ? `Action closed: ${describeAction(action)}`
        : `Action reopened: ${describeAction(action)}`
    );
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshActionAndTimelinePanels(incidentId);
  }

  function addAction(incidentId) {
    const text = $('#action-input').value.trim();
    if (!text) return;

    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;

    const action = {
      id: Storage.generateId(),
      text,
      owner: $('#action-owner').value.trim(),
      done: false,
      updatedAt: new Date().toISOString(),
      deleted: false,
      deletedAt: null,
    };
    incident.actions.push(action);
    addActionTimelineEntry(incident, `Action added: ${describeAction(action)}`);

    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshActionAndTimelinePanels(incidentId);
    toast('Action added', 'success');
  }

  function deleteAction(incidentId, actionId) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    const action = incident.actions.find((a) => a.id === actionId);
    if (!action) return;
    addActionTimelineEntry(incident, `Action deleted: ${describeAction(action)}`);
    action.deleted = true;
    action.deletedAt = new Date().toISOString();
    action.updatedAt = action.deletedAt;
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshActionAndTimelinePanels(incidentId);
  }

  function renderTeam(incident) {
    const panel = $('#tab-team');
    const team = incident.team || {};
    const bridge = data.settings.bridgeNumber || 'Not configured — set in Settings';

    const roles = [
      ['incidentCommander', 'Major Incident Manager'],
      ['technicalLead', 'Technical Lead'],
      ['commsLead', 'Communications Lead'],
      ['scribe', 'Scribe'],
      ['serviceOwner', 'Service Owner'],
      ['vendorContact', 'Vendor Contact'],
    ];

    panel.innerHTML = `
      <div class="overview-card" style="margin-bottom:20px">
        <h4>War Room Bridge</h4>
        <p style="font-family:var(--mono);font-size:1.1rem;color:var(--accent)">${esc(bridge)}</p>
        ${data.settings.orgName ? `<p class="text-muted">${esc(data.settings.orgName)}</p>` : ''}
      </div>
      <div class="role-grid">
        ${roles.map(([key, label]) => `
          <div class="role-card">
            <h5>${label}</h5>
            <input type="text" class="input team-field" data-role="${key}" value="${esc(team[key] || '')}" placeholder="Assign ${label.toLowerCase()}">
          </div>
        `).join('')}
      </div>`;

    panel.querySelectorAll('.team-field').forEach((input) => {
      input.addEventListener('change', () => {
        const inc = Storage.getIncident(data, incident.id);
        if (!inc) return;
        const changedAt = new Date().toISOString();
        inc.teamUpdatedAt = inc.teamUpdatedAt || {};
        inc.team[input.dataset.role] = input.value.trim();
        inc.teamUpdatedAt[input.dataset.role] = changedAt;
        if (input.dataset.role === 'incidentCommander') {
          inc.commander = input.value.trim();
          inc.fieldUpdatedAt = inc.fieldUpdatedAt || {};
          inc.fieldUpdatedAt.commander = changedAt;
        }
        Storage.upsertIncident(data, inc);
        data = Storage.load();
      });
    });
  }

  function renderComms(incident) {
    const panel = $('#tab-comms');

    if (!Comms.isLoaded()) {
      panel.innerHTML = '<div class="empty-state"><p class="text-muted">Loading templates…</p></div>';
      return;
    }

    const templates = Comms.renderForIncident(incident, data.settings, {
      statusLabel: (s) => STATUS_LABELS[s] || s,
      capitalize,
      formatDateTime,
      formatDuration,
    });
    const warnings = Comms.getWarnings();
    const warningHtml = warnings.length
      ? `<div class="empty-state" style="margin-bottom:16px"><p class="text-muted">Some communication templates could not be loaded: ${esc(warnings.join('; '))}</p></div>`
      : '';

    panel.innerHTML = warningHtml + templates.map((t) => `
      <div class="comms-template">
        <div class="comms-template-header">
          <h4>${t.title}</h4>
          <button class="btn btn-ghost btn-sm copy-template">Copy</button>
        </div>
        <div class="comms-template-body">${esc(t.body)}</div>
      </div>
    `).join('');

    panel.querySelectorAll('.copy-template').forEach((btn) => {
      btn.addEventListener('click', () => {
        const body = btn.closest('.comms-template').querySelector('.comms-template-body').textContent;
        navigator.clipboard.writeText(body).then(() => toast('Copied to clipboard', 'success'));
      });
    });
  }

  function renderPlaybooks() {
    $('#playbook-grid').innerHTML = PLAYBOOKS.map((pb) => `
      <div class="playbook-card">
        <h4>${pb.title}</h4>
        <p>${pb.description}</p>
        <ol class="playbook-steps">
          ${pb.steps.map((s) => `<li>${s}</li>`).join('')}
        </ol>
      </div>
    `).join('');
  }

  function confirmDelete(id) {
    if (confirm('Delete this incident permanently? This cannot be undone.')) {
      Storage.deleteIncident(data, id);
      data = Storage.load();
      toast('Incident deleted', 'success');
      navigate('incidents');
    }
  }

  function exportData() {
    const json = Storage.exportJSON(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mi-command-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        Storage.importJSON(data, ev.target.result);
        data = Storage.load();
        toast('Data imported successfully', 'success');
        render();
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearData() {
    if (confirm('Delete ALL incident data? This cannot be undone.')) {
      Storage.clearAll();
      data = Storage.load();
      toast('All data cleared', 'success');
      navigate('dashboard');
    }
  }

  function reportHelpers() {
    return {
      statusLabels: STATUS_LABELS,
      capitalize,
      formatDateTime,
      formatDuration,
    };
  }

  function exportIncidentReport() {
    if (!currentIncidentId) return;
    const incident = Storage.getIncident(data, currentIncidentId);
    if (!incident) return;
    Report.download(incident, data.settings, reportHelpers());
    toast('HTML report exported', 'success');
  }

  function exportIncidentReportText() {
    if (!currentIncidentId) return;
    const incident = Storage.getIncident(data, currentIncidentId);
    if (!incident) return;
    Report.downloadText(incident, data.settings, reportHelpers());
    toast('Text report exported', 'success');
  }

  function printReport() {
    if (!currentIncidentId) return;
    const incident = Storage.getIncident(data, currentIncidentId);
    if (!incident) return;
    if (!Report.print(incident, data.settings, reportHelpers())) {
      toast('Print window was blocked. Allow popups and try again.', 'error');
    }
  }

  function startDurationTimer() {
    stopDurationTimer();
    durationTimer = setInterval(() => {
      const incident = Storage.getIncident(data, currentIncidentId);
      if (!incident || incident.status === 'resolved') {
        stopDurationTimer();
        return;
      }
      const el = $('#live-duration');
      if (el) el.textContent = formatDuration(incident.createdAt);
    }, 1000);
  }

  function stopDurationTimer() {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  function updateClock() {
    const el = $('#live-clock');
    if (el) {
      el.textContent = new Date().toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }
  }

  function formatDuration(start, end) {
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const ms = Math.max(0, e - s);
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (days > 0) return `${days}d ${hrs % 24}h ${mins % 60}m`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function toast(message, type = '') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
