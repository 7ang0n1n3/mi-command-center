const ActionLists = (() => {
  let templates = [];
  let loaded = false;
  let warnings = [];

  const FIELD_MAP = {
    action: 'text',
    item: 'text',
    task: 'text',
    owner: 'owner',
    start: 'startText',
    end: 'endText',
    status: 'status',
    update: 'update',
  };

  async function load() {
    warnings = [];
    try {
      const manifestRes = await fetch('action-lists/manifest.json', { cache: 'no-store' });
      if (!manifestRes.ok) throw new Error('manifest not found');
      const manifest = await manifestRes.json();
      if (!Array.isArray(manifest)) throw new Error('manifest must be an array');

      const results = await Promise.all(
        manifest.map(async (item) => {
          if (!item?.file || !item?.title) {
            throw new Error('invalid manifest entry');
          }
          const fileRes = await fetch(`action-lists/${item.file}`, { cache: 'no-store' });
          if (!fileRes.ok) throw new Error(`missing ${item.file}`);
          const body = await fileRes.text();
          return { id: item.id || item.file, title: item.title, body: body.trim() };
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

      if (warnings.length) {
        console.warn('Action list templates: partial load -', warnings.join('; '));
      }
    } catch (err) {
      warnings = [err.message];
      templates = [];
      console.warn('Action list templates: unavailable -', err.message);
    }
    loaded = true;
    return templates;
  }

  function getWarnings() {
    return [...warnings];
  }

  function getTemplates() {
    return templates.map(({ id, title }) => ({ id, title }));
  }

  function findTemplate(id) {
    return templates.find((template) => template.id === id) || null;
  }

  function renderTemplateItems(templateId, vars) {
    const template = findTemplate(templateId);
    if (!template) return [];
    return parseItems(applyTemplate(template.body, vars));
  }

  function applyTemplate(body, vars) {
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  function parseItems(body) {
    return body
      .split(/\n\s*\n/)
      .map(parseBlock)
      .filter((item) => item.text);
  }

  function parseBlock(block) {
    const item = {
      text: '',
      owner: '',
      status: '',
      startText: '',
      endText: '',
      update: '',
    };
    const looseLines = [];

    block.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const match = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!match) {
        looseLines.push(trimmed);
        return;
      }

      const key = match[1].trim().toLowerCase();
      const field = FIELD_MAP[key];
      if (!field) return;
      item[field] = normalizeField(field, match[2].trim());
    });

    if (!item.text && looseLines.length) item.text = looseLines.join(' ');
    return item;
  }

  function normalizeField(field, value) {
    if (field !== 'status') return value;
    const normalized = value.toLowerCase().replace(/\s+/g, '-');
    if (['in-progress', 'completed', 'kiv'].includes(normalized)) return normalized;
    return '';
  }

  function isLoaded() {
    return loaded;
  }

  return { load, getTemplates, renderTemplateItems, getWarnings, isLoaded };
})();
