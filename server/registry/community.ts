/**
 * Community Blocks page — a host-served browse/search/install view.
 *
 * It is NOT part of the Blockly bundle — it's a standalone page that calls the
 * /api/registry* endpoints and renders client-side. Reachable from the
 * file-picker landing ("Manage community blocks") and from a button in the
 * editor toolbar.
 *
 * `runtimeHint` (optional) is the open file's runtime (e.g. `arduino:python`) when
 * the page is opened from the editor — used to label "applies to this file / other
 * files" so the user understands why an installed catalog may not appear yet.
 */
export function renderCommunityHtml(runtimeHint?: string): string {
  const hint = runtimeHint ? JSON.stringify(runtimeHint) : 'null';
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Community Blocks</title>
  <link rel="stylesheet" href="/assets/theme.css">
  <style>
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-editor-foreground, #d4d4d4); padding: 24px; margin: 0; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    h1 { font-size: 16px; margin: 0; flex: 1; }
    a.back { font-size: 12px; opacity: 0.85; text-decoration: none; color: var(--vscode-focusBorder, #007fd4); }
    #search { width: 100%; max-width: 360px; padding: 6px 10px; box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2)); border-radius: 4px;
      background: var(--vscode-input-background, rgba(0,0,0,0.3)); color: var(--vscode-input-foreground, inherit);
      font-size: 13px; outline: none; margin-bottom: 16px; }
    #search:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    .vendor { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin: 16px 0 6px; }
    .entry { display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px;
      border: 1px solid var(--vscode-editorWidget-border, #454545); border-radius: 6px; margin-bottom: 8px; }
    .entry .info { flex: 1; min-width: 0; }
    .entry .name { font-weight: 600; font-size: 13px; }
    .entry .name .ver { font-weight: 400; opacity: 0.6; margin-left: 6px; font-size: 11px; }
    .entry .desc { font-size: 12px; opacity: 0.85; margin: 2px 0; }
    .entry .meta { font-size: 11px; opacity: 0.6; }
    .entry .applies { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    .entry .applies.other { color: var(--vscode-editorWarning-foreground, #cca700); }
    button.install { white-space: nowrap; padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer;
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); font-size: 12px; }
    button.install:disabled { opacity: 0.55; cursor: default; }
    .installed { font-size: 12px; color: var(--vscode-testing-iconPassed, #73c991); white-space: nowrap; align-self: center; }
    .status { font-size: 12px; opacity: 0.7; margin: 8px 0; min-height: 16px; }
    .empty { opacity: 0.7; }
  </style>
</head>
<body>
  <header>
    <a class="back" href="javascript:history.length>1?history.back():location.assign('/')">‹ Back</a>
    <h1>Community Blocks</h1>
  </header>
  <input id="search" type="search" placeholder="Search community blocks…" autocomplete="off">
  <div class="status" id="status">Loading…</div>
  <div id="list"></div>
  <script>
    const RUNTIME_HINT = ${hint};
    const listEl = document.getElementById('list');
    const statusEl = document.getElementById('status');
    const searchEl = document.getElementById('search');

    function resolveDesc(d) {
      if (!d) return '';
      if (typeof d === 'string') return d;
      return d.en || Object.values(d)[0] || '';
    }
    function esc(s) {
      return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    function appliesLabel(entry) {
      if (!RUNTIME_HINT) return '';
      const matches = (entry.runtimes || []).includes(RUNTIME_HINT);
      return matches
        ? '<div class="applies">applies to this file</div>'
        : '<div class="applies other">⚠ applies to other files (open a matching file to use these blocks)</div>';
    }
    function entryHtml(entry) {
      const ver = entry.version ? '<span class="ver">v' + esc(entry.version) + '</span>' : '';
      const targets = (entry.targets && entry.targets.length) ? entry.targets.join(', ') : 'universal';
      const action = entry.installed
        ? '<span class="installed">✓ Installed</span>'
        : '<button class="install" data-id="' + esc(entry.id) + '">Install</button>';
      return '<div class="entry">' +
        '<div class="info">' +
          '<div class="name">' + esc(entry.id) + ver + '</div>' +
          '<div class="desc">' + esc(resolveDesc(entry.description)) + '</div>' +
          '<div class="meta">' + esc(entry.category) + ' • ' +
            esc((entry.runtimes || []).join(', ')) + ' • targets: ' + esc(targets) +
            ' • ' + (entry.blockCount || 0) + ' blocks</div>' +
          appliesLabel(entry) +
        '</div>' + action + '</div>';
    }

    function renderVendors(vendors) {
      if (!vendors.length) { listEl.innerHTML = '<p class="empty">No catalogs available.</p>'; return; }
      listEl.innerHTML = vendors.map(v =>
        '<div class="vendor">' + esc(v.vendor) + '</div>' + v.entries.map(entryHtml).join('')
      ).join('');
    }
    function renderFlat(entries) {
      listEl.innerHTML = entries.length
        ? entries.map(entryHtml).join('')
        : '<p class="empty">No matches.</p>';
    }

    async function loadAll() {
      statusEl.textContent = 'Loading…';
      try {
        const r = await fetch('/api/registry');
        const data = await r.json();
        renderVendors(data.vendors || []);
        statusEl.textContent = '';
      } catch (e) {
        statusEl.textContent = 'Failed to load registry: ' + e.message;
      }
    }
    async function search(q) {
      try {
        const r = await fetch('/api/registry/search?q=' + encodeURIComponent(q));
        const data = await r.json();
        renderFlat(data.entries || []);
        statusEl.textContent = '';
      } catch (e) {
        statusEl.textContent = 'Search failed: ' + e.message;
      }
    }

    listEl.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button.install');
      if (!btn) return;
      const id = btn.dataset.id;
      btn.disabled = true; btn.textContent = 'Installing…';
      try {
        const r = await fetch('/api/registry/install', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
        statusEl.textContent = 'Installed ' + id + '.';
        // Refresh the current view to reflect installed state.
        searchEl.value ? search(searchEl.value) : loadAll();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Install';
        statusEl.textContent = 'Install failed: ' + e.message;
      }
    });

    let t;
    searchEl.addEventListener('input', () => {
      clearTimeout(t);
      const q = searchEl.value.trim();
      t = setTimeout(() => q ? search(q) : loadAll(), 200);
    });

    loadAll();
  </script>
</body>
</html>`;
}
