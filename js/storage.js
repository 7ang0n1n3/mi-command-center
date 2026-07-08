const Storage = (() => {
  const CACHE_KEY = 'mi-command-data';
  const HANDLE_DB = 'mi-command-handles';
  const HANDLE_STORE = 'files';
  const HANDLE_KEY = 'data-file';
  const VERSION = 1;
  const POLL_INTERVAL = 3000;
  const STATUS_VALUES = ['declared', 'investigating', 'mitigating', 'monitoring', 'resolved'];
  const IMPACT_VALUES = ['enterprise', 'department', 'service'];

  let cache = null;
  let mode = 'local';
  let fileHandle = null;
  let fileName = null;
  let saveTimer = null;
  let persistInFlight = false;
  let pollTimer = null;
  let lastRevision = 0;
  let onStatusChange = null;
  let onDataChange = null;

  const defaultSettings = () => ({
    orgName: '',
    bridgeNumber: '',
  });

  const defaultMeta = () => ({
    lastSaved: new Date().toISOString(),
    revision: 0,
  });

  const defaultData = () => ({
    version: VERSION,
    meta: defaultMeta(),
    settings: defaultSettings(),
    incidents: [],
  });

  const defaultTeam = (commander = '') => ({
    incidentCommander: commander,
    technicalLead: '',
    commsLead: '',
    scribe: '',
    serviceOwner: '',
    vendorContact: '',
  });

  function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function asTimestamp(value, fallback) {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : fallback;
  }

  function normalizeTimelineEntry(entry, fallbackTime) {
    const raw = asRecord(entry);
    return {
      id: asString(raw.id) || generateId(),
      timestamp: asTimestamp(raw.timestamp, fallbackTime),
      author: asString(raw.author, 'System'),
      text: asString(raw.text, 'Imported timeline entry'),
      type: asString(raw.type, 'user'),
    };
  }

  function normalizeAction(action) {
    const raw = asRecord(action);
    const updatedAt = asTimestamp(raw.updatedAt, new Date().toISOString());
    const status = ['in-progress', 'completed', 'kiv'].includes(raw.status)
      ? raw.status
      : (raw.done === true ? 'completed' : 'in-progress');
    return {
      id: asString(raw.id) || generateId(),
      text: asString(raw.text, 'Imported action'),
      owner: asString(raw.owner),
      status,
      done: raw.done === true || status === 'completed',
      startedAt: raw.startedAt ? asTimestamp(raw.startedAt, updatedAt) : updatedAt,
      endedAt: raw.endedAt ? asTimestamp(raw.endedAt, null) : null,
      startText: asString(raw.startText),
      endText: asString(raw.endText),
      update: asString(raw.update),
      updatedAt,
      deleted: raw.deleted === true,
      deletedAt: raw.deletedAt ? asTimestamp(raw.deletedAt, updatedAt) : null,
    };
  }

  function normalizeWarRoomEntry(entry) {
    const raw = asRecord(entry);
    return {
      id: asString(raw.id) || generateId(),
      name: asString(raw.name),
      role: asString(raw.role),
    };
  }

  function normalizeWarRoomGroups(groups) {
    const raw = asRecord(groups);
    const normalized = {};
    for (const [key, entries] of Object.entries(raw)) {
      normalized[key] = Array.isArray(entries) ? entries.map(normalizeWarRoomEntry) : [];
    }
    return normalized;
  }

  function normalizeIncident(incident) {
    const raw = Labels.migrateIncident({ ...asRecord(incident) });
    const now = new Date().toISOString();
    const createdAt = asTimestamp(raw.createdAt, now);
    const updatedAt = asTimestamp(raw.updatedAt, createdAt);
    const commander = asString(raw.commander);
    const team = { ...defaultTeam(commander), ...asRecord(raw.team) };

    return {
      id: asString(raw.id) || generateId(),
      title: asString(raw.title, 'Untitled incident'),
      priority: Labels.PRIORITIES.includes(raw.priority) ? raw.priority : 'p2',
      severity: Labels.SEVERITIES.includes(raw.severity) ? raw.severity : 's3',
      impact: IMPACT_VALUES.includes(raw.impact) ? raw.impact : 'enterprise',
      services: asString(raw.services),
      description: asString(raw.description),
      status: STATUS_VALUES.includes(raw.status) ? raw.status : 'declared',
      commander,
      createdAt,
      updatedAt,
      resolvedAt: raw.resolvedAt ? asTimestamp(raw.resolvedAt, null) : null,
      timeline: Array.isArray(raw.timeline)
        ? raw.timeline.map((entry) => normalizeTimelineEntry(entry, createdAt))
        : [],
      actions: Array.isArray(raw.actions) ? raw.actions.map(normalizeAction) : [],
      team: {
        incidentCommander: asString(team.incidentCommander),
        technicalLead: asString(team.technicalLead),
        commsLead: asString(team.commsLead),
        scribe: asString(team.scribe),
        serviceOwner: asString(team.serviceOwner),
        vendorContact: asString(team.vendorContact),
      },
      warRoom: normalizeWarRoomGroups(raw.warRoom),
      warRoomBridgeUrl: asString(raw.warRoomBridgeUrl),
      fieldUpdatedAt: asRecord(raw.fieldUpdatedAt),
      teamUpdatedAt: asRecord(raw.teamUpdatedAt),
      comms: Array.isArray(raw.comms) ? raw.comms : [],
      details: asRecord(raw.details),
      errorSummary: asString(raw.errorSummary),
      businessImpact: asString(raw.businessImpact),
      rootCause: asString(raw.rootCause),
      resolution: asString(raw.resolution),
      nextAction: asString(raw.nextAction),
    };
  }

  function normalize(data) {
    const raw = asRecord(data);
    const normalized = {
      ...defaultData(),
      ...raw,
      meta: { ...defaultMeta(), ...asRecord(raw.meta) },
      settings: { ...defaultSettings(), ...asRecord(raw.settings) },
      incidents: Array.isArray(raw.incidents) ? raw.incidents.map(normalizeIncident) : [],
    };
    const revision = Number(normalized.meta.revision);
    normalized.meta.revision = Number.isFinite(revision) && revision >= 0 ? revision : 0;
    normalized.settings.orgName = asString(normalized.settings.orgName);
    normalized.settings.bridgeNumber = asString(normalized.settings.bridgeNumber);

    if (!normalized.meta.revision) {
      normalized.meta.revision = normalized.incidents.length;
    }
    return normalized;
  }

  function stamp(data) {
    data.meta = {
      lastSaved: new Date().toISOString(),
      revision: (data.meta?.revision || 0) + 1,
    };
    return data;
  }

  function revisionOf(data) {
    return data?.meta?.revision || 0;
  }

  function setStatus() {
    onStatusChange?.({
      mode,
      fileName: fileName || (mode === 'powershell-api' ? 'mi-data.json' : null),
      ready: !!cache,
      syncEnabled: mode === 'powershell-api',
    });
  }

  async function init(statusCallback, dataChangeCallback) {
    onStatusChange = statusCallback;
    onDataChange = dataChangeCallback;

    if (await tryFileApi()) {
      startPolling();
      return;
    }
    if (await tryFileHandle()) return;
    loadFromLocalStorage();
    setStatus();
  }

  async function tryFileApi() {
    try {
      const res = await fetch('/api/status', { method: 'GET' });
      if (!res.ok) return false;
      const status = await res.json();
      const dataRes = await fetch('/api/data');
      if (!dataRes.ok) return false;
      cache = normalize(await dataRes.json());
      lastRevision = revisionOf(cache);
      mode = 'powershell-api';
      fileName = status.path || 'mi-data.json';
      setStatus();
      return true;
    } catch {
      return false;
    }
  }

  async function tryFileHandle() {
    if (!('showOpenFilePicker' in window)) return false;
    try {
      const handle = await idbGet(HANDLE_KEY);
      if (!handle) return false;
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await handle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') return false;
      }
      fileHandle = handle;
      fileName = handle.name;
      cache = normalize(await readHandle(handle));
      lastRevision = revisionOf(cache);
      mode = 'fs-access';
      setStatus();
      return true;
    } catch {
      await idbDelete(HANDLE_KEY);
      return false;
    }
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      cache = raw ? normalize(JSON.parse(raw)) : defaultData();
    } catch {
      cache = defaultData();
    }
    lastRevision = revisionOf(cache);
    mode = 'local';
    fileName = null;
  }

  function load() {
    return cache
      ? {
          ...cache,
          meta: { ...cache.meta },
          settings: { ...cache.settings },
          incidents: cache.incidents.map((i) => ({ ...i })),
        }
      : defaultData();
  }

  function save(data) {
    cache = stamp(normalize(data));
    lastRevision = revisionOf(cache);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    schedulePersist();
    return cache;
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 150);
  }

  function isPersisting() {
    return persistInFlight || !!saveTimer;
  }

  async function persist() {
    if (!cache) return;
    const json = JSON.stringify(cache, null, 2);
    persistInFlight = true;

    try {
      if (mode === 'powershell-api') {
        const res = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
        if (!res.ok) throw new Error('Save failed');
        return;
      }

      if (mode === 'fs-access' && fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
      }
    } catch (err) {
      console.error('Failed to persist data:', err);
    } finally {
      persistInFlight = false;
    }
  }

  function timestampOf(value) {
    return new Date(value || 0).getTime();
  }

  function mergeById(localItems, remoteItems, mergeItem) {
    const localMap = new Map((localItems || []).map((item) => [item.id, item]));
    const remoteMap = new Map((remoteItems || []).map((item) => [item.id, item]));
    const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
    return [...ids].map((id) => mergeItem(localMap.get(id), remoteMap.get(id))).filter(Boolean);
  }

  function mergeTimeline(localTimeline, remoteTimeline) {
    return mergeById(localTimeline, remoteTimeline, (localItem, remoteItem) => remoteItem || localItem)
      .sort((a, b) => timestampOf(a.timestamp) - timestampOf(b.timestamp));
  }

  function mergeAction(localAction, remoteAction) {
    if (!localAction) return remoteAction;
    if (!remoteAction) return localAction;
    const localAt = timestampOf(localAction.updatedAt || localAction.deletedAt);
    const remoteAt = timestampOf(remoteAction.updatedAt || remoteAction.deletedAt);
    return remoteAt >= localAt ? remoteAction : localAction;
  }

  function mergeActions(localActions, remoteActions) {
    return mergeById(localActions, remoteActions, mergeAction);
  }

  function mergeTeam(localTeam, remoteTeam, preferRemote) {
    const merged = {};
    for (const key of Object.keys(defaultTeam())) {
      const localValue = asString(localTeam?.[key]);
      const remoteValue = asString(remoteTeam?.[key]);
      if (!localValue) merged[key] = remoteValue;
      else if (!remoteValue) merged[key] = localValue;
      else merged[key] = preferRemote ? remoteValue : localValue;
    }
    return merged;
  }

  function mergeFieldUpdatedAt(localTimes, remoteTimes) {
    const merged = {};
    const keys = new Set([...Object.keys(localTimes || {}), ...Object.keys(remoteTimes || {})]);
    for (const key of keys) {
      const localTime = asTimestamp(localTimes?.[key], '');
      const remoteTime = asTimestamp(remoteTimes?.[key], '');
      merged[key] = timestampOf(remoteTime) >= timestampOf(localTime) ? remoteTime : localTime;
    }
    return merged;
  }

  function mergeScalarField(local, remote, field, preferRemote) {
    const localTime = timestampOf(local.fieldUpdatedAt?.[field] || local.updatedAt);
    const remoteTime = timestampOf(remote.fieldUpdatedAt?.[field] || remote.updatedAt);
    if (remoteTime === localTime) return preferRemote ? remote[field] : local[field];
    return remoteTime > localTime ? remote[field] : local[field];
  }

  function mergeTeamFields(local, remote, preferRemote) {
    const team = {};
    for (const key of Object.keys(defaultTeam())) {
      const localValue = asString(local.team?.[key]);
      const remoteValue = asString(remote.team?.[key]);
      const localTime = timestampOf(local.teamUpdatedAt?.[key] || local.updatedAt);
      const remoteTime = timestampOf(remote.teamUpdatedAt?.[key] || remote.updatedAt);
      if (!localValue) team[key] = remoteValue;
      else if (!remoteValue) team[key] = localValue;
      else if (remoteTime === localTime) team[key] = preferRemote ? remoteValue : localValue;
      else team[key] = remoteTime > localTime ? remoteValue : localValue;
    }
    return team;
  }

  function shortValue(value) {
    const text = value === null || value === undefined || value === '' ? 'blank' : String(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }

  function conflictTimelineEntry(incidentId, field, localValue, remoteValue, keptValue, keptSource, timestamp) {
    const key = `${incidentId}-${field}-${timestampOf(timestamp)}`;
    return {
      id: `SYNC-CONFLICT-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`,
      timestamp,
      author: 'System',
      text: `Sync conflict on ${field}: kept ${keptSource} value "${shortValue(keptValue)}" over ${keptSource === 'remote' ? 'local' : 'remote'} value "${shortValue(keptSource === 'remote' ? localValue : remoteValue)}"`,
      type: 'system',
    };
  }

  function mergeConflictTimeline(local, remote, merged, preferRemote) {
    const fields = incidentScalarFields();
    const entries = [...merged.timeline];
    const existingIds = new Set(entries.map((entry) => entry.id));

    for (const field of fields) {
      if (local[field] === remote[field]) continue;
      const localTime = timestampOf(local.fieldUpdatedAt?.[field] || local.updatedAt);
      const remoteTime = timestampOf(remote.fieldUpdatedAt?.[field] || remote.updatedAt);
      const keptSource = remoteTime === localTime
        ? (preferRemote ? 'remote' : 'local')
        : (remoteTime > localTime ? 'remote' : 'local');
      const timestamp = keptSource === 'remote'
        ? (remote.fieldUpdatedAt?.[field] || remote.updatedAt)
        : (local.fieldUpdatedAt?.[field] || local.updatedAt);
      const entry = conflictTimelineEntry(local.id, field, local[field], remote[field], merged[field], keptSource, timestamp);
      if (!existingIds.has(entry.id)) {
        entries.push(entry);
        existingIds.add(entry.id);
      }
    }

    return entries.sort((a, b) => timestampOf(a.timestamp) - timestampOf(b.timestamp));
  }

  function mergeIncident(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    const localAt = timestampOf(local.updatedAt);
    const remoteAt = timestampOf(remote.updatedAt);
    const preferRemote = remoteAt >= localAt;
    const preferred = preferRemote ? remote : local;
    const other = preferRemote ? local : remote;
    const merged = {
      ...preferred,
      createdAt: timestampOf(local.createdAt) <= timestampOf(remote.createdAt) ? local.createdAt : remote.createdAt,
      updatedAt: timestampOf(preferred.updatedAt) >= timestampOf(other.updatedAt)
        ? preferred.updatedAt
        : other.updatedAt,
      timeline: mergeTimeline(local.timeline, remote.timeline),
      actions: mergeActions(local.actions, remote.actions),
      team: mergeTeamFields(local, remote, preferRemote),
      fieldUpdatedAt: mergeFieldUpdatedAt(local.fieldUpdatedAt, remote.fieldUpdatedAt),
      teamUpdatedAt: mergeFieldUpdatedAt(local.teamUpdatedAt, remote.teamUpdatedAt),
      comms: preferRemote ? remote.comms : local.comms,
    };
    for (const field of incidentScalarFields()) {
      merged[field] = mergeScalarField(local, remote, field, preferRemote);
    }
    merged.timeline = mergeConflictTimeline(local, remote, merged, preferRemote);
    return merged;
  }

  function mergeData(local, remote) {
    const merged = normalize(remote);
    const localMap = new Map((local?.incidents || []).map((i) => [i.id, i]));
    const remoteMap = new Map((remote?.incidents || []).map((i) => [i.id, i]));
    const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);

    merged.incidents = [...ids]
      .map((id) => mergeIncident(localMap.get(id), remoteMap.get(id)))
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const localRev = revisionOf(local);
    const remoteRev = revisionOf(remote);
    if (localRev > remoteRev) {
      merged.settings = { ...local.settings };
      merged.meta = { ...local.meta };
    }

    return merged;
  }

  function dataSignature(data) {
    return JSON.stringify({
      revision: revisionOf(data),
      content: contentSignature(data),
    });
  }

  function contentSignature(data) {
    return JSON.stringify({
      version: data?.version || VERSION,
      settings: data.settings,
      incidents: data.incidents || [],
    });
  }

  async function poll() {
    if (mode !== 'powershell-api' || persistInFlight) return null;

    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) return null;
      const remote = normalize(await res.json());
      const remoteRev = revisionOf(remote);
      const localContent = contentSignature(cache);
      const remoteContent = contentSignature(remote);

      if (remoteRev === lastRevision && remoteContent === localContent) return null;
      if (isPersisting()) return null;

      const before = dataSignature(cache);
      cache = mergeData(cache, remote);
      lastRevision = revisionOf(cache);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

      const changed = before !== dataSignature(cache);
      return changed ? { changed: true, revision: lastRevision } : null;
    } catch {
      return { error: true };
    }
  }

  function startPolling() {
    stopPolling();
    if (mode !== 'powershell-api') return;

    pollTimer = setInterval(async () => {
      const result = await poll();
      if (result?.changed) {
        onDataChange?.({ source: 'remote', revision: result.revision });
      } else if (result?.error) {
        onDataChange?.({ source: 'error' });
      }
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function readHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    return text ? JSON.parse(text) : defaultData();
  }

  async function linkExistingFile() {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('Your browser does not support direct file access. Run start.bat or start.ps1 instead.');
    }
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'MI Command Data', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    await adoptHandle(handle);
    return { fileName: handle.name, mode };
  }

  async function createNewFile() {
    if (!('showSaveFilePicker' in window)) {
      throw new Error('Your browser does not support direct file access. Run start.bat or start.ps1 instead.');
    }
    const handle = await window.showSaveFilePicker({
      suggestedName: 'mi-data.json',
      types: [{ description: 'MI Command Data', accept: { 'application/json': ['.json'] } }],
    });
    cache = cache || defaultData();
    await adoptHandle(handle);
    await persist();
    return { fileName: handle.name, mode };
  }

  async function adoptHandle(handle) {
    fileHandle = handle;
    fileName = handle.name;
    mode = 'fs-access';
    try {
      const file = await handle.getFile();
      if (file.size > 0) {
        cache = normalize(await readHandle(handle));
      } else {
        cache = stamp(cache || defaultData());
        await persist();
      }
    } catch {
      cache = stamp(cache || defaultData());
      await persist();
    }
    lastRevision = revisionOf(cache);
    await idbSet(HANDLE_KEY, handle);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    setStatus();
  }

  async function unlinkFile() {
    if (mode === 'powershell-api') {
      throw new Error('Data file is managed by the local server and cannot be unlinked.');
    }
    fileHandle = null;
    fileName = null;
    mode = 'local';
    await idbDelete(HANDLE_KEY);
    setStatus();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function generateId() {
    return `MI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function incidentScalarFields() {
    return [
      'title',
      'priority',
      'severity',
      'impact',
      'services',
      'description',
      'status',
      'commander',
      'resolvedAt',
      'errorSummary',
      'businessImpact',
      'rootCause',
      'resolution',
      'nextAction',
      'warRoomBridgeUrl',
    ];
  }

  function createIncident(fields) {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      title: fields.title,
      priority: fields.priority || 'p1',
      severity: fields.severity || 's1',
      impact: fields.impact || 'enterprise',
      services: fields.services || '',
      description: fields.description || '',
      status: 'declared',
      commander: fields.commander || '',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      timeline: [
        {
          id: generateId(),
          timestamp: now,
          author: fields.commander || 'System',
          text: 'Major Incident declared',
          type: 'system',
        },
      ],
      actions: [
        { id: generateId(), text: 'Establish war room bridge', owner: 'MIM', status: 'in-progress', done: false, startedAt: now, endedAt: null, startText: '', endText: '', update: '', updatedAt: now, deleted: false, deletedAt: null },
        { id: generateId(), text: 'Notify executive stakeholders', owner: 'Comms Lead', status: 'in-progress', done: false, startedAt: now, endedAt: null, startText: '', endText: '', update: '', updatedAt: now, deleted: false, deletedAt: null },
        { id: generateId(), text: 'Assign technical investigation lead', owner: 'MIM', status: 'in-progress', done: false, startedAt: now, endedAt: null, startText: '', endText: '', update: '', updatedAt: now, deleted: false, deletedAt: null },
        { id: generateId(), text: 'Begin customer impact assessment', owner: 'Service Owner', status: 'in-progress', done: false, startedAt: now, endedAt: null, startText: '', endText: '', update: '', updatedAt: now, deleted: false, deletedAt: null },
        { id: generateId(), text: 'Draft initial status communication', owner: 'Comms Lead', status: 'in-progress', done: false, startedAt: now, endedAt: null, startText: '', endText: '', update: '', updatedAt: now, deleted: false, deletedAt: null },
      ],
      team: {
        incidentCommander: fields.commander || '',
        technicalLead: '',
        commsLead: '',
        scribe: '',
        serviceOwner: '',
        vendorContact: '',
      },
      warRoom: {},
      warRoomBridgeUrl: '',
      fieldUpdatedAt: {
        title: now,
        priority: now,
        severity: now,
        impact: now,
        services: now,
        description: now,
        status: now,
        commander: now,
        resolvedAt: now,
        errorSummary: now,
        businessImpact: now,
        rootCause: now,
        resolution: now,
        nextAction: now,
        warRoomBridgeUrl: now,
      },
      teamUpdatedAt: {
        incidentCommander: now,
        technicalLead: now,
        commsLead: now,
        scribe: now,
        serviceOwner: now,
        vendorContact: now,
      },
      comms: [],
      details: {},
      errorSummary: '',
      businessImpact: '',
      rootCause: '',
      resolution: '',
      nextAction: '',
    };
  }

  function getIncidents(data) {
    return data.incidents || [];
  }

  function getIncident(data, id) {
    return getIncidents(data).find((i) => i.id === id) || null;
  }

  function upsertIncident(data, incident) {
    const idx = data.incidents.findIndex((i) => i.id === incident.id);
    incident.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      data.incidents[idx] = incident;
    } else {
      data.incidents.unshift(incident);
    }
    save(data);
    return incident;
  }

  function deleteIncident(data, id) {
    data.incidents = data.incidents.filter((i) => i.id !== id);
    save(data);
  }

  function clearAll() {
    cache = stamp(defaultData());
    lastRevision = revisionOf(cache);
    localStorage.removeItem(CACHE_KEY);
    schedulePersist();
  }

  function exportJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(data, jsonString) {
    const imported = JSON.parse(jsonString);
    if (!imported.incidents || !Array.isArray(imported.incidents)) {
      throw new Error('Invalid import file: missing incidents array');
    }
    const existingIds = new Set(data.incidents.map((i) => i.id));
    for (const incident of imported.incidents) {
      if (!existingIds.has(incident.id)) {
        data.incidents.push(incident);
        existingIds.add(incident.id);
      } else {
        const idx = data.incidents.findIndex((i) => i.id === incident.id);
        if (idx >= 0) data.incidents[idx] = incident;
      }
    }
    if (imported.settings) {
      data.settings = { ...data.settings, ...imported.settings };
    }
    save(data);
    return load();
  }

  function getStorageInfo() {
    return { mode, fileName, syncEnabled: mode === 'powershell-api' };
  }

  const ACTIVE_STATUSES = ['declared', 'investigating', 'mitigating', 'monitoring'];

  function isActive(incident) {
    return ACTIVE_STATUSES.includes(incident.status);
  }

  return {
    init,
    load,
    save,
    poll,
    startPolling,
    stopPolling,
    isPersisting,
    createIncident,
    getIncidents,
    getIncident,
    upsertIncident,
    deleteIncident,
    clearAll,
    exportJSON,
    importJSON,
    isActive,
    ACTIVE_STATUSES,
    generateId,
    linkExistingFile,
    createNewFile,
    unlinkFile,
    getStorageInfo,
  };
})();
