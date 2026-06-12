import { SHIM_JS } from './shim';
import { L10nData } from './l10n';

export interface EditableFile {
  relPath: string;
  language: string;
  hasSidecar: boolean;
}

/**
 * Editor HTML host — assembles the IDE-style page that boots the webview bundle.
 *
 *  - the webview script is served at /webview.js;
 *  - --vscode-* tokens come from /assets/theme.css (G9);
 *  - the acquireVsCodeApi() shim is inlined BEFORE webview.js (Guardrail G3);
 *  - host chrome labels are English literals (host i18n can come later — the
 *    webview's own l10n still flows via the four JSON <script> tags below).
 *
 * Layout: a top menu bar (App Lab metrics — 14px/700, 56px tall), a collapsible
 * file explorer on the left listing every editable file, and the Blockly
 * workspace filling the rest. Switching files is a plain navigation to
 * /edit?file=…; the shim reconnects the /session WebSocket from location.search,
 * so the boot order below is preserved on every file open.
 *
 * The four JSON <script> tags and the trailing module script preserve the
 * webview's fixed boot order: it reads #l10n-data / #l10n-locale /
 * #block-messages-en / #block-messages-locale at import time, then runs
 * l10n.config → Blockly.setLocale → Msg merges → plugin inits → block defs →
 * catalog load. Do not reorder these tags or move the module script above them.
 */
export function renderEditorHtml(l10n: L10nData, files: EditableFile[], currentRel: string): string {
  const locale = l10n.locale || 'en';
  const badgeFor = (language: string): string => (language === 'python' ? 'Py' : 'C++');
  const currentFile = files.find(f => f.relPath === currentRel);
  const currentLang = currentFile?.language ?? (currentRel.toLowerCase().endsWith('.py') ? 'python' : 'cpp');
  const fileItems = files.map(f => {
    const active = f.relPath === currentRel;
    return `
      <a class="file-item${active ? ' active' : ''}" href="/edit?file=${encodeURIComponent(f.relPath)}"${active ? ' aria-current="true"' : ''}>
        <span class="badge">${badgeFor(f.language)}</span>
        <span class="name" title="${f.relPath}">${f.relPath}</span>
        <span class="state" title="${f.hasSidecar ? 'has blocks' : 'no blocks yet'}">${f.hasSidecar ? '●' : '○'}</span>
      </a>`;
  }).join('');

  return /* html */ `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blocks Editor</title>
  <link rel="stylesheet" href="/assets/theme.css">
  <style>
    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; font-family: var(--vscode-font-family, sans-serif); }

    /* --- menu bar (App Lab metrics: 56px tall, 14px/700 items) --------------- */
    #menubar {
      display: flex; align-items: center; gap: 16px;
      height: 56px; box-sizing: border-box; padding: 0 16px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
      background: var(--vscode-editorWidget-background, #252526);
      position: relative; z-index: 100;
    }
    #menubar .spacer { flex: 1; }
    .menu-item {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 700; letter-spacing: 0.01em;
      line-height: 24px; color: var(--vscode-editor-foreground, #d4d4d4);
      background: none; border: none; padding: 4px 0; margin: 0;
      text-decoration: none; cursor: pointer; opacity: 0.85; white-space: nowrap;
      font-family: inherit;
    }
    .menu-item:hover { opacity: 1; }
    #explorerToggle svg { display: block; flex-shrink: 0; }
    #explorerToggle .badge {
      font-size: 10px; font-weight: 600; letter-spacing: 0; padding: 1px 5px; border-radius: 4px;
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
      flex-shrink: 0;
    }
    #explorerToggle .file-name { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu-item .caret { display: block; flex-shrink: 0; opacity: 0.7; margin-left: -2px; }
    #envLabel { font-size: 12px; font-weight: 600; opacity: 0.7; }

    /* --- workspace area ----------------------------------------------------- */
    #main { display: flex; flex-grow: 1; min-height: 0; }
    #fileExplorer {
      width: 240px; flex-shrink: 0; box-sizing: border-box;
      border-right: 1px solid var(--vscode-editorWidget-border, #454545);
      background: var(--vscode-editorWidget-background, #252526);
      overflow-y: auto; overflow-x: hidden;
      transition: width 0.15s ease;
    }
    #fileExplorer.collapsed { width: 0; border-right: none; }
    .explorer-header {
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      opacity: 0.55; padding: 14px 16px 6px;
    }
    .file-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 16px;
      text-decoration: none; color: var(--vscode-editor-foreground, #d4d4d4);
      font-size: 13px; cursor: pointer;
    }
    .file-item:hover { background: var(--vscode-editor-selectionBackground, rgba(255,255,255,0.07)); }
    .file-item.active { background: var(--vscode-editor-selectionBackground, rgba(255,255,255,0.12)); font-weight: 600; }
    .file-item .badge {
      font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px;
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
      flex-shrink: 0;
    }
    .file-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-item .state { font-size: 10px; opacity: 0.5; flex-shrink: 0; }
    .explorer-empty { padding: 8px 16px; font-size: 12px; opacity: 0.6; }

    #editorArea { position: relative; flex-grow: 1; min-width: 0; }
    #blocklyDiv { position: absolute; inset: 0; }

    /* --- community panel (right, collapsible) -------------------------------- */
    #communityPanel {
      width: 360px; flex-shrink: 0; box-sizing: border-box;
      border-left: 1px solid var(--vscode-editorWidget-border, #454545);
      background: var(--vscode-editor-background, #1e1e1e);
      display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.15s ease;
    }
    #communityPanel.collapsed { width: 0; border-left: none; }
    #communityPanel .panel-header {
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      padding: 0 8px 0 16px; height: 40px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
    }
    #communityPanel .panel-title {
      flex: 1; font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; opacity: 0.6; white-space: nowrap;
    }
    #communityPanel .panel-close {
      background: none; border: none; cursor: pointer; padding: 4px 6px;
      color: var(--vscode-editor-foreground, #d4d4d4); opacity: 0.6;
      font-size: 13px; line-height: 1; border-radius: 4px; font-family: inherit;
    }
    #communityPanel .panel-close:hover { opacity: 1; background: var(--vscode-editor-selectionBackground, rgba(255,255,255,0.08)); }
    #communityFrame { flex: 1; width: 100%; border: 0; }
    #emptyState {
      position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 24px; gap: 8px;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, sans-serif);
    }
    #emptyState.visible { display: flex; }
    #emptyState .title { font-size: 14px; font-weight: 600; }
    #emptyState .hint { font-size: 12px; opacity: 0.75; max-width: 420px; }

    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer { pointer-events: auto !important; }
    .blocklyToolboxCategoryContainer[aria-labelledby="toolbox-search-input.label"] { margin: 0; padding: 0; }
    .blocklyToolboxCategory[id="toolbox-search-input"] { padding: 6px 8px !important; display: flex !important; align-items: center !important; }
    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer { display: flex; align-items: center; width: 100%; }
    input#toolbox-search-input {
      width: 100%; padding: 5px 8px; margin: 0;
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
      border-radius: 3px;
      background: var(--vscode-input-background, rgba(0,0,0,0.3));
      color: var(--vscode-input-foreground, inherit);
      font-size: 12px; font-family: var(--vscode-font-family, sans-serif);
      outline: none; box-sizing: border-box;
    }
    input#toolbox-search-input:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    input#toolbox-search-input::placeholder { color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.4)); }
  </style>
</head>
<body>
  <div id="menubar">
    <button class="menu-item" id="explorerToggle" title="Toggle file explorer" aria-label="Toggle file explorer">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1zm0 4.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1zM1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/></svg>
      <span class="badge">${badgeFor(currentLang)}</span>
      <span class="file-name" title="${currentRel}">${currentRel}</span>
    </button>
    <span class="spacer"></span>
    <label class="menu-item" id="envLabel" for="envSelect" style="display:none">Environment</label>
    <vscode-dropdown id="envSelect" style="display:none"></vscode-dropdown>
    <a class="menu-item" id="docsBtn" href="#" title="Documentation" style="display:none">Documentation<svg class="caret" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.2 5.7a.7.7 0 0 1 1 0L8 9.5l3.8-3.8a.7.7 0 1 1 1 1l-4.3 4.3a.7.7 0 0 1-1 0L3.2 6.7a.7.7 0 0 1 0-1z"/></svg></a>
    <button class="menu-item" id="communityToggle" title="Browse and install community blocks">Community Blocks ▸</button>
    <vscode-button id="generateBtn" disabled>Generate Code</vscode-button>
  </div>
  <div id="main">
    <nav id="fileExplorer" aria-label="Files">
      <div class="explorer-header">Files</div>
      ${files.length ? fileItems : '<div class="explorer-empty">No editable files found.</div>'}
    </nav>
    <div id="editorArea">
      <div id="blocklyDiv"></div>
      <div id="emptyState">
        <div class="title">No board detected</div>
        <div class="hint">Open this file inside a project containing a <code>sketch.yaml</code> to load the blocks compatible with your board.</div>
      </div>
    </div>
    <aside id="communityPanel" class="collapsed" aria-label="Community Blocks">
      <div class="panel-header">
        <span class="panel-title">Community Blocks</span>
        <button class="panel-close" id="communityClose" title="Close" aria-label="Close">✕</button>
      </div>
      <iframe id="communityFrame" title="Community Blocks" data-src="/community?file=${encodeURIComponent(currentRel)}&embed=1"></iframe>
    </aside>
  </div>
  <script>
    (function () {
      // Re-fit Blockly once a side panel's width transition lands, so the
      // workspace reclaims (or yields) the freed space.
      function refitOnResize(el) {
        el.addEventListener('transitionend', function (e) {
          if (e.propertyName === 'width') window.dispatchEvent(new Event('resize'));
        });
      }

      // Collapsible file explorer (left). State persists across file navigations
      // (each file open is a full page load).
      var explorer = document.getElementById('fileExplorer');
      var explorerToggle = document.getElementById('explorerToggle');
      var EXP_KEY = 'blocksAuthor.explorerCollapsed';
      try { if (localStorage.getItem(EXP_KEY) === '1') explorer.classList.add('collapsed'); } catch (e) {}
      explorerToggle.addEventListener('click', function () {
        var collapsed = explorer.classList.toggle('collapsed');
        try { localStorage.setItem(EXP_KEY, collapsed ? '1' : '0'); } catch (e) {}
      });
      refitOnResize(explorer);

      // Collapsible Community Blocks panel (right). The iframe loads lazily on
      // first open; installing inside it POSTs /api/registry/install, which makes
      // the host re-push the filtered catalog to this session's toolbox live.
      var panel = document.getElementById('communityPanel');
      var frame = document.getElementById('communityFrame');
      var communityToggle = document.getElementById('communityToggle');
      var communityClose = document.getElementById('communityClose');
      var COM_KEY = 'blocksAuthor.communityOpen';
      function setCommunity(open) {
        panel.classList.toggle('collapsed', !open);
        if (open && !frame.src) frame.src = frame.dataset.src;
        try { localStorage.setItem(COM_KEY, open ? '1' : '0'); } catch (e) {}
      }
      try { if (localStorage.getItem(COM_KEY) === '1') setCommunity(true); } catch (e) {}
      communityToggle.addEventListener('click', function () {
        setCommunity(panel.classList.contains('collapsed'));
      });
      communityClose.addEventListener('click', function () { setCommunity(false); });
      refitOnResize(panel);
    })();
  </script>
  <script id="l10n-data" type="application/json">${l10n.bundle}</script>
  <script id="l10n-locale" type="application/json">"${locale}"</script>
  <script id="block-messages-en" type="application/json">${l10n.blockMessages.en}</script>
  <script id="block-messages-locale" type="application/json">${l10n.blockMessages.locale}</script>
  <script>${SHIM_JS}</script>
  <script type="module" src="/webview.js"></script>
</body>
</html>`;
}
