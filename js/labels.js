const Labels = (() => {
  const PRIORITIES = ['p1', 'p2', 'p3', 'p4'];
  const SEVERITIES = ['s1', 's2', 's3', 's4', 's5'];

  const PRIORITY_LABELS = {
    p1: 'P1',
    p2: 'P2',
    p3: 'P3',
    p4: 'P4',
  };

  const SEVERITY_LABELS = {
    s1: 'S1',
    s2: 'S2',
    s3: 'S3',
    s4: 'S4',
    s5: 'S5',
  };

  const PRIORITY_DESCRIPTIONS = {
    p1: 'P1 — Highest priority',
    p2: 'P2 — High priority',
    p3: 'P3 — Medium priority',
    p4: 'P4 — Low priority',
  };

  const SEVERITY_DESCRIPTIONS = {
    s1: 'S1 — Critical impact',
    s2: 'S2 — Major impact',
    s3: 'S3 — Moderate impact',
    s4: 'S4 — Minor impact',
    s5: 'S5 — Minimal impact',
  };

  function priorityLabel(value) {
    return PRIORITY_LABELS[value] || '—';
  }

  function severityLabel(value) {
    return SEVERITY_LABELS[value] || '—';
  }

  function priorityFull(value) {
    return PRIORITY_DESCRIPTIONS[value] || priorityLabel(value);
  }

  function severityFull(value) {
    return SEVERITY_DESCRIPTIONS[value] || severityLabel(value);
  }

  function priorityBadgeClass(value) {
    return `badge-priority-${value || 'p3'}`;
  }

  function severityBadgeClass(value) {
    return `badge-severity-${value || 's3'}`;
  }

  function migrateIncident(incident) {
    if (!incident) return incident;

    if (PRIORITIES.includes(incident.priority) && SEVERITIES.includes(incident.severity)) {
      return incident;
    }

    if (incident.severity === 'critical') {
      incident.priority = 'p1';
      incident.severity = 's1';
    } else if (incident.severity === 'high') {
      incident.priority = 'p2';
      incident.severity = 's2';
    } else {
      incident.priority = PRIORITIES.includes(incident.priority) ? incident.priority : 'p2';
      incident.severity = SEVERITIES.includes(incident.severity) ? incident.severity : 's3';
    }

    return incident;
  }

  return {
    PRIORITIES,
    SEVERITIES,
    PRIORITY_LABELS,
    SEVERITY_LABELS,
    PRIORITY_DESCRIPTIONS,
    SEVERITY_DESCRIPTIONS,
    priorityLabel,
    severityLabel,
    priorityFull,
    severityFull,
    priorityBadgeClass,
    severityBadgeClass,
    migrateIncident,
  };
})();