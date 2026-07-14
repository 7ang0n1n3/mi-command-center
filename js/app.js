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
  const pendingOverviewAudit = new Map();
  const THEME_KEY = 'mi-command-theme';

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

  const DETAIL_FIELDS = [
    { key: 'incidentNo', label: 'Incident No', type: 'text', placeholder: 'new inc' },
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
    applyThemePreference();
    await Storage.init(updateStorageStatus, handleRemoteUpdate);
    await Comms.load();
    data = Storage.load();
    bindNavigation();
    bindDeclareForm();
    bindSettings();
    bindTabs();
    bindThemeToggle();
    bindEditingGuards();
    updateClock();
    setInterval(updateClock, 1000);
    render();
  }

  function applyThemePreference() {
    const theme = localStorage.getItem(THEME_KEY) || 'dark';
    document.body.classList.toggle('light', theme === 'light');
    updateThemeToggleLabel(theme);
  }

  function bindThemeToggle() {
    $('#btn-theme-toggle')?.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, nextTheme);
      document.body.classList.toggle('light', nextTheme === 'light');
      updateThemeToggleLabel(nextTheme);
    });
    updateThemeToggleLabel(document.body.classList.contains('light') ? 'light' : 'dark');
  }

  function updateThemeToggleLabel(theme) {
    const btn = $('#btn-theme-toggle');
    if (!btn) return;
    btn.textContent = theme === 'light' ? '☾ Dark' : '☀ Light';
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

    $('#btn-export-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      $('#export-menu')?.classList.toggle('open');
    });
    $('#btn-export-report-menu')?.addEventListener('click', () => {
      $('#export-menu')?.classList.remove('open');
      exportIncidentReport();
    });
    $('#btn-export-report-txt-menu')?.addEventListener('click', () => {
      $('#export-menu')?.classList.remove('open');
      exportIncidentReportText();
    });
    document.addEventListener('click', () => $('#export-menu')?.classList.remove('open'));
  }

  function restoreActiveTab() {
    $$('.detail-tabs .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
    $$('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${currentTab}`);
    });
  }

  function updateDetailTabVisibility(incident) {
    const commsTab = $('.detail-tabs .tab[data-tab="comms"]');
    const hideComms = ['s4', 's5'].includes(incident.severity);
    commsTab?.classList.toggle('hidden', hideComms);
    if (hideComms && currentTab === 'comms') currentTab = 'overview';
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
          incidentDisplayId(i).toLowerCase().includes(search) ||
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
              <td><code>${esc(incidentDisplayId(i))}</code></td>
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

  function incidentDisplayId(incident) {
    return incident.details?.incidentNo || incident.id;
  }

  function renderDetail() {
    const incident = Storage.getIncident(data, currentIncidentId);
    if (!incident) {
      navigate('incidents');
      return;
    }

    $('#page-subtitle').textContent = incident.id;

    const isResolved = incident.status === 'resolved';
    const details = incident.details || {};
    const severityNumber = severityNumberOf(incident.severity);
    const impactedCompany = details.impCompany || '—';

    $('#detail-header').innerHTML = `
      <div class="detail-utils">
        <div class="zoom-ctl"><button class="zoom-btn" type="button">−</button><span class="zoom-val">100%</span><button class="zoom-btn" type="button">+</button></div>
      </div>
      <div class="detail-header-top">
        <div class="detail-title-block">
          <div class="detail-title-wrap">
            <span class="detail-title-prefix">Sev ${severityNumber} - </span>
            <input class="detail-title-input" id="detail-title" value="${esc(incident.title)}" aria-label="Incident title">
          </div>
          <div class="detail-meta-row">
            <div class="detail-meta-item">
              <span>Status</span>
              <span class="status-badge badge-${incident.status}">${STATUS_LABELS[incident.status]}</span>
            </div>
            <div class="detail-meta-item">
              <span>Impacted Company</span>
              <span data-meta="impacted-company">${esc(impactedCompany)}</span>
            </div>
            <div class="detail-meta-item">
              <span>Duration</span>
              <span class="duration-live ${isResolved ? 'resolved' : ''}" id="live-duration">${formatDuration(incident.createdAt, incident.resolvedAt)}</span>
            </div>
            <div class="detail-meta-item">
              <span>MIM</span>
              <input class="detail-mini-input" id="detail-mim" value="${esc(incident.commander || '')}" placeholder="Unassigned" aria-label="Major Incident Manager">
            </div>
          </div>
        </div>
        <div class="detail-header-actions">
          ${isResolved
            ? '<button class="btn btn-secondary btn-sm btn-resolved" id="btn-reopen" disabled>Resolved</button>'
            : '<button class="btn btn-primary btn-sm" id="btn-resolve">Mark Resolved</button>'}
          <button class="btn btn-ghost btn-sm" id="btn-delete-mi">Delete</button>
        </div>
      </div>`;

    $('#detail-title')?.addEventListener('input', () => scheduleOverviewSave(incident.id));
    $('#detail-title')?.addEventListener('change', () => saveOverview(incident.id, true));
    $('#detail-mim')?.addEventListener('input', () => {
      const overviewCommander = $('#ov-commander');
      if (overviewCommander) overviewCommander.value = $('#detail-mim').value;
      scheduleOverviewSave(incident.id);
    });
    $('#detail-mim')?.addEventListener('change', () => saveOverview(incident.id, true));
    $('#btn-resolve')?.addEventListener('click', () => resolveIncident(incident.id));
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
    updateDetailTabVisibility(incident);
    restoreActiveTab();
  }

  function renderOverviewHeader(incident) {
    const isResolved = incident.status === 'resolved';
    const statusEl = $('#detail-header .status-badge');
    if (statusEl) {
      statusEl.className = `status-badge badge-${incident.status}`;
      statusEl.textContent = STATUS_LABELS[incident.status];
    }
    const titleInput = $('#detail-title');
    if (titleInput && document.activeElement !== titleInput) titleInput.value = incident.title;
    const mimInput = $('#detail-mim');
    if (mimInput && document.activeElement !== mimInput) mimInput.value = incident.commander || '';
    const companyEl = $('#detail-header [data-meta="impacted-company"]');
    if (companyEl) companyEl.textContent = incident.details?.impCompany || '—';
    $('#btn-resolve')?.toggleAttribute('disabled', false);
    if (!isResolved && !$('#btn-resolve')) {
      $('.detail-header-actions')?.insertAdjacentHTML('afterbegin',
        '<button class="btn btn-primary btn-sm" id="btn-resolve">Mark Resolved</button>');
      $('#btn-resolve')?.addEventListener('click', () => resolveIncident(incident.id));
    }
  }

  function renderOverview(incident) {
    const panel = $('#tab-overview');
    const nextOpenAction = (incident.actions || []).find((a) => !a.deleted && !a.done)?.text || '';
    panel.innerHTML = `
      <section class="mi-card mi-status-card">
        <div class="mi-card-title">Status Progression</div>
        <div class="status-flow">
            ${STATUS_ORDER.map((s) => `
              <button class="status-btn ${incident.status === s ? 'current' : ''}" data-status="${s}" ${canTransition(incident.status, s) ? '' : 'disabled'}>
                ${STATUS_LABELS[s]}
              </button>
            `).join('')}
        </div>
      </section>

      <div class="mi-overview-grid">
        <section class="mi-card">
          <div class="mi-card-title">Incident Summary</div>
          <div class="summary-block">
            <div class="summary-head">Summary</div>
            <label class="summary-label" for="ov-description">Short Description</label>
            <textarea class="textarea summary-textarea" id="ov-description" rows="3" placeholder="On 5th June 2026, Application team reported,,,">${esc(incident.description)}</textarea>
            <label class="summary-label" for="ov-error">Error</label>
            <textarea class="textarea summary-textarea" id="ov-error" rows="3" placeholder="Error: ** if has **">${esc(incident.errorSummary || '')}</textarea>
          </div>
          <div class="summary-block">
            <div class="summary-head">Impact</div>
            <textarea class="textarea" id="ov-business-impact" rows="2" placeholder="Business impact of the incident">${esc(incident.businessImpact || '')}</textarea>
          </div>
          <div class="summary-block">
            <div class="summary-head">Root Cause</div>
            <textarea class="textarea" id="ov-rootcause" rows="2" placeholder="Document root cause when known">${esc(incident.rootCause || '')}</textarea>
          </div>
          <div class="summary-block">
            <div class="summary-head">Resolution</div>
            <textarea class="textarea" id="ov-resolution" rows="2" placeholder="How was the incident resolved?">${esc(incident.resolution || '')}</textarea>
          </div>
          <div class="summary-block">
            <div class="summary-head">Next Action Item</div>
            <textarea class="textarea" id="ov-next-action" rows="2" placeholder="What happens next?">${esc(incident.nextAction || nextOpenAction)}</textarea>
          </div>
        </section>

        <section class="mi-card">
          <div class="mi-card-title">Incident Details</div>
          <div class="detail-list">
            ${DETAIL_FIELDS.map((field) => renderDetailField(incident, field)).join('')}
          </div>
        </section>
      </div>`;

    panel.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', () => updateStatus(incident.id, btn.dataset.status));
    });

    ['ov-description', 'ov-error', 'ov-business-impact', 'ov-rootcause', 'ov-resolution', 'ov-next-action'].forEach((id) => {
      const el = $(`#${id}`);
      el?.addEventListener('input', () => {
        scheduleOverviewSave(incident.id);
      });
      el?.addEventListener('change', () => saveOverview(incident.id));
    });

    bindDetailFields(incident);
  }

  function renderDetailField(incident, field) {
    const value = detailValue(incident, field);
    if (field.type === 'priority') {
      return `
        <div class="detail-row">
          <label class="detail-label" for="detail-${field.key}">${field.label}</label>
          <select id="detail-${field.key}" class="select incident-detail-field" data-detail-key="${field.key}" data-detail-type="${field.type}">
            ${buildPrioritySeverityOptions(incident.priority, incident.severity)}
          </select>
        </div>`;
    }
    if (field.type === 'datetime') {
      const dt = normalizeDetailDateTime(value, incident.createdAt);
      return `
        <div class="detail-row">
          <label class="detail-label" for="detail-${field.key}-date">${field.label}</label>
          <div class="datetime-field">
            <input type="date" id="detail-${field.key}-date" class="incident-detail-field" data-detail-key="${field.key}" data-detail-type="${field.type}" data-part="date" value="${esc(dt.date)}">
            <input type="text" class="time-input incident-detail-field" data-detail-key="${field.key}" data-detail-type="${field.type}" data-part="time" value="${esc(dt.time)}" placeholder="HH:MM" maxlength="5">
            <span>JST</span>
          </div>
        </div>`;
    }
    const Tag = field.type === 'textarea' ? 'textarea' : 'input';
    const attrs = field.type === 'textarea'
      ? `rows="1">${esc(value || '')}</textarea>`
      : `type="text" value="${esc(value || '')}" placeholder="${esc(field.placeholder || '-')}" />`;
    return `
      <div class="detail-row">
        <label class="detail-label" for="detail-${field.key}">${field.label}</label>
        <${Tag} id="detail-${field.key}" class="input incident-detail-field" data-detail-key="${field.key}" data-detail-type="${field.type}" ${attrs}
      </div>`;
  }

  function bindDetailFields(incident) {
    $$('.incident-detail-field').forEach((field) => {
      field.addEventListener('input', () => {
        if (field.dataset.detailKey === 'impCompany') {
          const companyEl = $('#detail-header [data-meta="impacted-company"]');
          if (companyEl) companyEl.textContent = field.value.trim() || '—';
        }
      });
      field.addEventListener('change', () => saveDetailField(incident.id, field));
    });
  }

  function saveDetailField(incidentId, fieldEl) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    incident.details = incident.details || {};
    const key = fieldEl.dataset.detailKey;
    const type = fieldEl.dataset.detailType;
    const changedAt = new Date().toISOString();
    const previousRawValue = incident.details[key];
    const previousValue = JSON.stringify(previousRawValue || '');
    const previousTimelineValue = detailTimelineValue(key, previousRawValue, incident);

    if (type === 'datetime') {
      const date = $(`[data-detail-key="${key}"][data-part="date"]`)?.value || '';
      const time = $(`[data-detail-key="${key}"][data-part="time"]`)?.value || '';
      incident.details[key] = { date, time };
    } else {
      incident.details[key] = fieldEl.value.trim();
    }
    if (JSON.stringify(incident.details[key] || '') === previousValue) return;

    if (key === 'priority') {
      const [priority, severity] = fieldEl.value.split('|');
      incident.priority = priority;
      incident.severity = severity;
      incident.fieldUpdatedAt = { ...(incident.fieldUpdatedAt || {}), priority: changedAt, severity: changedAt };
    }
    if (key === 'impServices') {
      incident.services = fieldEl.value.trim();
      incident.fieldUpdatedAt = { ...(incident.fieldUpdatedAt || {}), services: changedAt };
    }
    if (key === 'impCompany') {
      const companyEl = $('#detail-header [data-meta="impacted-company"]');
      if (companyEl) companyEl.textContent = fieldEl.value.trim() || '—';
    }

    incident.updatedAt = changedAt;
    addSystemTimelineEntry(
      incident,
      `Incident detail updated: ${detailFieldLabel(key)} changed from ${previousTimelineValue} to ${detailTimelineValue(key, incident.details[key], incident)}`,
      changedAt
    );
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    const savedIncident = Storage.getIncident(data, incidentId);
    if (key === 'priority') renderDetail();
    else {
      refreshTimelinePanel(savedIncident);
      updateSyncStatus();
    }
  }

  function detailValue(incident, field) {
    const details = incident.details || {};
    if (field.key === 'incidentNo') return details.incidentNo || incident.id;
    if (field.key === 'priority') return details.priority || `${incident.priority}|${incident.severity}`;
    if (field.key === 'impServices') return details.impServices || incident.services || '';
    return details[field.key] || '';
  }

  function detailFieldLabel(key) {
    return DETAIL_FIELDS.find((field) => field.key === key)?.label || key;
  }

  function detailTimelineValue(key, rawValue, incident) {
    if (key === 'priority') {
      const [priority, severity] = String(rawValue || `${incident.priority}|${incident.severity}`).split('|');
      return `${Labels.priorityLabel(priority)} / ${Labels.severityLabel(severity)}`;
    }
    if (rawValue && typeof rawValue === 'object') {
      const date = rawValue.date || 'No date';
      const time = rawValue.time || 'HH:MM';
      return `${date} ${time} JST`;
    }
    const value = String(rawValue || '').trim();
    if (!value) return 'blank';
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  function buildPrioritySeverityOptions(priority, severity) {
    const selected = `${priority}|${severity}`;
    const options = [];
    for (const p of Labels.PRIORITIES) {
      for (const s of Labels.SEVERITIES) {
        options.push(`<option value="${p}|${s}" ${selected === `${p}|${s}` ? 'selected' : ''}>Priority ${p.slice(1)} - Severity ${s.slice(1)}</option>`);
      }
    }
    return options.join('');
  }

  function normalizeDetailDateTime(value, fallbackIso) {
    if (value && typeof value === 'object') {
      return { date: value.date || toDateInput(fallbackIso), time: value.time || '' };
    }
    return { date: toDateInput(fallbackIso), time: '' };
  }

  function scheduleOverviewSave(id) {
    clearTimeout(overviewSaveTimer);
    overviewSaveTimer = setTimeout(() => saveOverview(id, false, false), 500);
  }

  function saveOverview(id, refreshHeader = false, logTimeline = true) {
    const incident = Storage.getIncident(data, id);
    if (!incident) return;
    const nextValues = {
      title: $('#detail-title')?.value.trim() || incident.title,
      priority: $('#ov-priority')?.value || incident.priority,
      severity: $('#ov-severity')?.value || incident.severity,
      impact: $('#ov-impact')?.value || incident.impact,
      services: $('#ov-services')?.value.trim() ?? incident.services,
      description: $('#ov-description')?.value.trim() ?? incident.description,
      errorSummary: $('#ov-error')?.value.trim() ?? incident.errorSummary,
      businessImpact: $('#ov-business-impact')?.value.trim() ?? incident.businessImpact,
      rootCause: $('#ov-rootcause')?.value.trim() ?? incident.rootCause,
      resolution: $('#ov-resolution')?.value.trim() ?? incident.resolution,
      nextAction: $('#ov-next-action')?.value.trim() ?? incident.nextAction,
      commander: ($('#detail-mim')?.value ?? $('#ov-commander')?.value ?? incident.commander).trim(),
    };
    const changedAt = new Date().toISOString();
    incident.fieldUpdatedAt = incident.fieldUpdatedAt || {};
    const changedFields = [];
    for (const [field, value] of Object.entries(nextValues)) {
      if (incident[field] !== value) {
        incident[field] = value;
        incident.fieldUpdatedAt[field] = changedAt;
        changedFields.push(field);
      }
    }
    const pendingFields = pendingOverviewAudit.get(id) || new Set();
    if (!logTimeline) {
      changedFields.forEach((field) => pendingFields.add(field));
      if (pendingFields.size) pendingOverviewAudit.set(id, pendingFields);
    } else {
      changedFields.forEach((field) => pendingFields.add(field));
      if (pendingFields.size) {
        addSystemTimelineEntry(incident, `Overview updated: ${[...pendingFields].map((field) => `${overviewFieldLabel(field)} = ${overviewTimelineValue(incident[field])}`).join('; ')}`, changedAt);
        pendingOverviewAudit.delete(id);
      }
    }
    incident.team = incident.team || {};
    incident.team.incidentCommander = incident.commander;
    incident.teamUpdatedAt = incident.teamUpdatedAt || {};
    incident.teamUpdatedAt.incidentCommander = changedAt;
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshTimelinePanel(Storage.getIncident(data, id));
    updateSyncStatus();
    if (refreshHeader) renderOverviewHeader(Storage.getIncident(data, id));
  }

  function overviewFieldLabel(field) {
    const labels = {
      title: 'Title',
      priority: 'Priority',
      severity: 'Severity',
      impact: 'Impact scope',
      services: 'Affected services',
      description: 'Short description',
      errorSummary: 'Error',
      businessImpact: 'Business impact',
      rootCause: 'Root cause',
      resolution: 'Resolution',
      nextAction: 'Next action item',
      commander: 'MIM',
    };
    return labels[field] || field;
  }

  function overviewTimelineValue(value) {
    const text = String(value || '').trim();
    if (!text) return 'blank';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  function updateStatus(id, status, options = {}) {
    const incident = Storage.getIncident(data, id);
    if (!incident || incident.status === status) return;
    if (!options.force && !canTransition(incident.status, status)) {
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
    updateStatus(id, 'resolved', { force: true });
  }

  function reopenIncident(id) {
    updateStatus(id, 'monitoring');
  }

  function renderTimeline(incident) {
    const panel = $('#tab-timeline');
    const entries = [...(incident.timeline || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    panel.innerHTML = `
      <section class="mi-card">
        <div class="mi-card-title">Timeline</div>
        <div class="mi-add-row top">
          <input type="text" class="input" id="timeline-input" placeholder="Add timeline note...">
          <input type="text" class="input owner-input" id="timeline-author" placeholder="Author" value="Analyst">
          <button class="btn btn-primary btn-sm" id="btn-add-timeline">Add</button>
        </div>
        <div class="mi-table-wrap">
          <table class="mi-table timeline-table">
            <thead><tr><th>Time</th><th>Author</th><th>Entry</th></tr></thead>
            <tbody>
              ${entries.length ? entries.map((e) => `
                <tr>
                  <td class="mono nowrap">${formatDateTime(e.timestamp)}</td>
                  <td class="timeline-author ${e.type === 'system' ? 'system' : ''}">${esc(e.author || 'Analyst')}</td>
                  <td>${esc(e.text)}</td>
                </tr>
              `).join('') : '<tr><td colspan="3" class="empty-table">No timeline entries yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;

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

  function addSystemTimelineEntry(incident, text, timestamp = new Date().toISOString()) {
    incident.timeline.push({
      id: Storage.generateId(),
      timestamp,
      author: 'System',
      text,
      type: 'system',
    });
  }

  function addActionTimelineEntry(incident, text) {
    addSystemTimelineEntry(incident, text);
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

  function refreshTimelinePanel(incident) {
    if (!incident || !$('#tab-timeline')) return;
    if (userIsEditing && currentTab === 'timeline') return;
    renderTimeline(incident);
  }

  function renderActions(incident) {
    const panel = $('#tab-actions');
    const actions = (incident.actions || []).filter((a) => !a.deleted);

    panel.innerHTML = `
      <section class="mi-card">
        <div class="mi-card-title">Action Items</div>
        <div class="mi-add-row top">
          <input type="text" class="input" id="action-input" placeholder="New action item...">
          <input type="text" class="input owner-input" id="action-owner" placeholder="Owner">
          <button class="btn btn-primary btn-sm" id="btn-add-action">Add</button>
        </div>
        <div class="mi-table-wrap">
          <table class="mi-table action-table">
            <thead>
              <tr><th>SL</th><th>Start</th><th>End</th><th>Action</th><th>Owner</th><th>Status</th><th>Update</th><th></th></tr>
            </thead>
            <tbody>
              ${actions.length ? actions.map((a, index) => `
                <tr class="${a.done ? 'action-completed' : ''}" data-action-id="${a.id}">
                  <td class="sl">${index + 1}</td>
                  <td><input class="table-input time-cell-input action-field" data-field="startText" value="${esc(actionStartValue(a))}" placeholder="text"></td>
                  <td><input class="table-input time-cell-input action-field" data-field="endText" value="${esc(actionEndValue(a))}" placeholder="text"></td>
                  <td><textarea class="table-input action-textarea action-field" data-field="text" rows="4">${esc(a.text)}</textarea></td>
                  <td><input class="table-input owner-cell-input action-field" data-field="owner" value="${esc(a.owner || '')}" placeholder="Text field"></td>
                  <td>
                    <select class="select action-status status-${a.status || 'blank'}" data-field="status">
                      <option value="" ${!a.status ? 'selected' : ''}>-</option>
                      <option value="in-progress" ${a.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                      <option value="completed" ${a.status === 'completed' || a.done ? 'selected' : ''}>Completed</option>
                      <option value="kiv" ${a.status === 'kiv' ? 'selected' : ''}>KIV</option>
                    </select>
                  </td>
                  <td><textarea class="table-input action-textarea action-field" data-field="update" rows="4" placeholder="Text Field">${esc(a.update || '')}</textarea></td>
                  <td><button class="action-delete" title="Remove">&times;</button></td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="empty-table">No action items yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;

    panel.querySelectorAll('.action-field').forEach((field) => {
      field.addEventListener('change', () => {
        const row = field.closest('tr');
        updateActionField(incident.id, row.dataset.actionId, field.dataset.field, field.value);
      });
    });

    panel.querySelectorAll('.action-status').forEach((select) => {
      select.addEventListener('change', () => {
        const row = select.closest('tr');
        updateActionField(incident.id, row.dataset.actionId, 'status', select.value);
      });
    });

    panel.querySelectorAll('.action-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        deleteAction(incident.id, row.dataset.actionId);
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

  function updateActionField(incidentId, actionId, field, value) {
    const incident = Storage.getIncident(data, incidentId);
    const action = incident?.actions?.find((a) => a.id === actionId);
    if (!action) return;
    const changedAt = new Date().toISOString();
    const previousDone = action.done === true;
    const previousValue = field === 'status' ? action.status : action[field];

    if (field === 'status') {
      action.status = value;
      action.done = value === 'completed';
      if (value === 'in-progress' && !action.startedAt) action.startedAt = changedAt;
      if (value === 'completed') {
        if (!action.startedAt) action.startedAt = changedAt;
        if (!action.endedAt) action.endedAt = changedAt;
      } else {
        action.endedAt = null;
        action.endText = '';
      }
      if (!value || value === 'kiv') {
        action.startedAt = null;
        action.startText = '';
      }
    } else if (['text', 'owner', 'update', 'startText', 'endText'].includes(field)) {
      action[field] = value.trim();
    }

    action.updatedAt = changedAt;
    if ((previousValue || '') === (value.trim?.() || value || '')) {
      renderActions(Storage.getIncident(data, incidentId));
      return;
    }
    if (field === 'status' && previousDone !== action.done) {
      addActionTimelineEntry(
        incident,
        action.done
          ? `Action closed: ${describeAction(action)}`
          : `Action reopened: ${describeAction(action)}`
      );
    } else if (field === 'status') {
      addActionTimelineEntry(incident, `Action status changed to ${actionStatusText(action.status)}: ${describeAction(action)}`);
    } else {
      addActionTimelineEntry(incident, `Action updated (${actionFieldLabel(field)}): ${describeAction(action)}`);
    }
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshActionAndTimelinePanels(incidentId);
  }

  function actionFieldLabel(field) {
    const labels = {
      text: 'Action',
      owner: 'Owner',
      update: 'Update',
      startText: 'Start',
      endText: 'End',
      status: 'Status',
    };
    return labels[field] || field;
  }

  function actionStartValue(action) {
    if (!['in-progress', 'completed'].includes(action.status)) return '';
    return action.startText || formatActionTime(action.startedAt);
  }

  function actionEndValue(action) {
    if (action.status !== 'completed') return '';
    return action.endText || formatActionTime(action.endedAt);
  }

  function actionStatusText(status) {
    const labels = {
      '': '-',
      'in-progress': 'In Progress',
      completed: 'Completed',
      kiv: 'KIV',
    };
    return labels[status || ''] || status;
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
      status: '',
      done: false,
      startedAt: null,
      endedAt: null,
      startText: '',
      endText: '',
      update: '',
      updatedAt: new Date().toISOString(),
      deleted: false,
      deletedAt: null,
    };
    incident.actions.unshift(action);
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
    const groups = [
      ['mim', 'MIM'],
      ['technicalTeam', 'Technical Team'],
      ['vendor', 'Vendor'],
      ['sme', 'SME'],
      ['leadership', 'Decision Maker/PSM/Leadership'],
    ];

    panel.innerHTML = `
      <section class="war-room-bridge">
        <label for="war-room-bridge-url">Bridge URL</label>
        <input type="url" class="input" id="war-room-bridge-url" value="${esc(incident.warRoomBridgeUrl || '')}" placeholder="Paste team meeting URL...">
        <button class="btn btn-primary" id="war-room-join" type="button" ${incident.warRoomBridgeUrl ? '' : 'disabled'}>Join</button>
      </section>
      <div class="war-room-grid">
        ${groups.map(([key, label]) => `
          <section class="war-room-card" data-war-room-group="${key}">
            <div class="war-room-card-header">
              <h4>${label}</h4>
              <button class="btn btn-ghost btn-sm war-room-add" type="button" data-group="${key}">Add Entry</button>
            </div>
            <table class="war-room-table">
              <thead>
                <tr><th></th><th>Name</th><th>Role</th></tr>
              </thead>
              <tbody>
                ${warRoomEntries(incident, key).map((entry, index) => `
                  <tr data-entry-id="${entry.id}">
                    <td class="war-room-index">${index + 1}</td>
                    <td><input class="input war-room-field" data-group="${key}" data-entry-id="${entry.id}" data-field="name" value="${esc(entry.name || '')}" placeholder="Name"></td>
                    <td><input class="input war-room-field" data-group="${key}" data-entry-id="${entry.id}" data-field="role" value="${esc(entry.role || '')}" placeholder="Role"></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </section>
        `).join('')}
      </div>`;

    $('#war-room-bridge-url')?.addEventListener('input', (e) => {
      $('#war-room-join')?.toggleAttribute('disabled', !e.target.value.trim());
    });
    $('#war-room-bridge-url')?.addEventListener('change', (e) => saveWarRoomBridgeUrl(incident.id, e.target.value));
    $('#war-room-join')?.addEventListener('click', () => openWarRoomBridge(incident.id));

    panel.querySelectorAll('.war-room-field').forEach((input) => {
      input.addEventListener('change', () => saveWarRoomField(incident.id, input));
    });

    panel.querySelectorAll('.war-room-add').forEach((btn) => {
      btn.addEventListener('click', () => addWarRoomEntry(incident.id, btn.dataset.group));
    });
  }

  function saveWarRoomBridgeUrl(incidentId, value) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    const nextValue = value.trim();
    if ((incident.warRoomBridgeUrl || '') === nextValue) return;
    incident.warRoomBridgeUrl = nextValue;
    incident.fieldUpdatedAt = incident.fieldUpdatedAt || {};
    incident.fieldUpdatedAt.warRoomBridgeUrl = new Date().toISOString();
    incident.updatedAt = incident.fieldUpdatedAt.warRoomBridgeUrl;
    addSystemTimelineEntry(incident, 'War Room bridge URL updated', incident.updatedAt);
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshTimelinePanel(Storage.getIncident(data, incidentId));
    updateSyncStatus();
  }

  function openWarRoomBridge(incidentId) {
    const incident = Storage.getIncident(data, incidentId);
    const url = incident?.warRoomBridgeUrl?.trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  function warRoomEntries(incident, group) {
    const entries = incident.warRoom?.[group];
    if (Array.isArray(entries) && entries.length) return entries;
    return [
      { id: `${group}-1`, name: '', role: '' },
      { id: `${group}-2`, name: '', role: '' },
    ];
  }

  function ensureWarRoomGroup(incident, group) {
    incident.warRoom = incident.warRoom || {};
    if (!Array.isArray(incident.warRoom[group]) || !incident.warRoom[group].length) {
      incident.warRoom[group] = warRoomEntries(incident, group);
    }
    return incident.warRoom[group];
  }

  function saveWarRoomField(incidentId, input) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    const entries = ensureWarRoomGroup(incident, input.dataset.group);
    const entry = entries.find((item) => item.id === input.dataset.entryId);
    if (!entry) return;
    const nextValue = input.value.trim();
    if ((entry[input.dataset.field] || '') === nextValue) return;
    entry[input.dataset.field] = nextValue;
    incident.updatedAt = new Date().toISOString();
    addSystemTimelineEntry(
      incident,
      `War Room updated (${warRoomGroupLabel(input.dataset.group)} ${input.dataset.field}): ${entry.name || 'Unnamed'}${entry.role ? ` - ${entry.role}` : ''}`,
      incident.updatedAt
    );
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    refreshTimelinePanel(Storage.getIncident(data, incidentId));
    updateSyncStatus();
  }

  function addWarRoomEntry(incidentId, group) {
    const incident = Storage.getIncident(data, incidentId);
    if (!incident) return;
    ensureWarRoomGroup(incident, group).push({
      id: Storage.generateId(),
      name: '',
      role: '',
    });
    incident.updatedAt = new Date().toISOString();
    addSystemTimelineEntry(incident, `War Room entry added: ${warRoomGroupLabel(group)}`, incident.updatedAt);
    Storage.upsertIncident(data, incident);
    data = Storage.load();
    const savedIncident = Storage.getIncident(data, incidentId);
    renderTeam(savedIncident);
    refreshTimelinePanel(savedIncident);
  }

  function warRoomGroupLabel(group) {
    const labels = {
      mim: 'MIM',
      technicalTeam: 'Technical Team',
      vendor: 'Vendor',
      sme: 'SME',
      leadership: 'Decision Maker/PSM/Leadership',
    };
    return labels[group] || group;
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
      const time = new Date().toLocaleString('en-GB', {
        timeZone: 'Asia/Tokyo',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      el.textContent = `${time} JST`;
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

  function formatCompactTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function formatActionTime(iso) {
    if (!iso) return '';
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

  function toDateInput(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function severityNumberOf(severity) {
    return String(severity || 's3').replace(/^s/i, '') || '3';
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
