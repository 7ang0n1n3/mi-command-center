const Comms = (() => {
  let templates = [];
  let loaded = false;
  let warnings = [];

  const FALLBACK = [
    {
      title: 'Initial Notification',
      body: `[MAJOR INCIDENT] {{title}}

Status: {{status}}
Priority: {{priorityLabel}}
Severity: {{severityLabel}}
Impact: {{impact}}
Affected Services: {{services}}

Major Incident Manager: {{mim}}
Time: {{time}}

— {{org}} Service Desk`,
    },
  ];

  async function load() {
    warnings = [];
    try {
      const manifestRes = await fetch('comms/manifest.json', { cache: 'no-store' });
      if (!manifestRes.ok) throw new Error('manifest not found');
      const manifest = await manifestRes.json();
      if (!Array.isArray(manifest)) throw new Error('manifest must be an array');

      const results = await Promise.all(
        manifest.map(async (item) => {
          if (!item?.file || !item?.title) {
            throw new Error('invalid manifest entry');
          }
          const fileRes = await fetch(`comms/${item.file}`, { cache: 'no-store' });
          if (!fileRes.ok) throw new Error(`missing ${item.file}`);
          const body = await fileRes.text();
          return { id: item.id, title: item.title, body: body.trim() };
        }).map((promise) => promise.then(
          (template) => ({ template }),
          (err) => ({ warning: err.message })
        ))
      );

      templates = results
        .filter((result) => result.template)
        .map((result) => result.template);

      warnings = results
        .filter((result) => result.warning)
        .map((result) => result.warning);

      if (templates.length === 0) {
        warnings.push('no communication templates loaded');
        templates = FALLBACK;
      }

      if (warnings.length) {
        console.warn('Comms templates: partial load —', warnings.join('; '));
      }
    } catch (err) {
      warnings = [err.message, 'using fallback template'];
      console.warn('Comms templates: using fallback —', err.message);
      templates = FALLBACK;
    }
    loaded = true;
    return templates;
  }

  function getWarnings() {
    return [...warnings];
  }

  function applyTemplate(body, vars) {
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  function buildVars(incident, settings, helpers) {
    const openActions = (incident.actions || [])
      .filter((a) => !a.deleted && !a.done)
      .slice(0, 5)
      .map((a) => `• ${a.text}${a.owner ? ` (${a.owner})` : ''}`)
      .join('\n');

    const rootCause = incident.rootCause?.trim();

    return {
      title: incident.title,
      status: helpers.statusLabel(incident.status),
      priorityLabel: Labels.priorityFull(incident.priority),
      severityLabel: Labels.severityFull(incident.severity),
      impact: helpers.capitalize(incident.impact),
      services: incident.services || 'Under assessment',
      description: incident.description || 'Investigation ongoing.',
      mim: incident.commander || 'TBC',
      time: helpers.formatDateTime(new Date().toISOString()),
      org: settings.orgName || 'Organisation',
      duration: helpers.formatDuration(incident.createdAt, incident.resolvedAt),
      openActions: openActions || '• Investigation continuing',
      resolution: incident.resolution || 'Service restored. Monitoring in progress.',
      rootCauseLine: rootCause ? `Root Cause: ${rootCause}` : '',
    };
  }

  function renderForIncident(incident, settings, helpers) {
    const vars = buildVars(incident, settings, helpers);
    return templates.map((t) => ({
      title: t.title,
      body: applyTemplate(t.body, vars),
    }));
  }

  function isLoaded() {
    return loaded;
  }

  return { load, renderForIncident, isLoaded, getWarnings };
})();
