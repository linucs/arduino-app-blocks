import { SHIM_JS } from './shim';
import { L10nData } from './l10n';

/**
 * Editor HTML host — assembles the page that boots the webview bundle.
 *
 *  - the webview script is served at /webview.js;
 *  - --vscode-* tokens come from /assets/theme.css (G9);
 *  - the acquireVsCodeApi() shim is inlined BEFORE webview.js (Guardrail G3);
 *  - host chrome labels are English literals (host i18n can come later — the
 *    webview's own l10n still flows via the four JSON <script> tags below).
 *
 * The four JSON <script> tags and the trailing module script preserve the
 * webview's fixed boot order: it reads #l10n-data / #l10n-locale /
 * #block-messages-en / #block-messages-locale at import time, then runs
 * l10n.config → Blockly.setLocale → Msg merges → plugin inits → block defs →
 * catalog load. Do not reorder these tags or move the module script above them.
 */
export function renderEditorHtml(l10n: L10nData): string {
  const locale = l10n.locale || 'en';
  return /* html */ `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blocks Editor</title>
  <link rel="stylesheet" href="/assets/theme.css">
  <style>
    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
    #toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #454545); position: relative; z-index: 100; }
    #toolbar .spacer { flex: 1; }
    #toolbar label { font-size: 12px; opacity: 0.8; }
    #toolbar a.back { font-size: 12px; opacity: 0.85; text-decoration: none; color: var(--vscode-focusBorder, #007fd4); }
    #editorArea { position: relative; flex-grow: 1; width: 100%; }
    #blocklyDiv { position: absolute; inset: 0; }
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
  <div id="toolbar">
    <a class="back" href="/">‹ Files</a>
    <label id="envLabel" for="envSelect" style="display:none">Environment</label>
    <vscode-dropdown id="envSelect" style="display:none"></vscode-dropdown>
    <vscode-button id="docsBtn" appearance="icon" title="Documentation" style="display:none"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 1h-11a1.5 1.5 0 0 0-1.5 1.5v11a1.5 1.5 0 0 0 1.5 1.5h11a.5.5 0 0 0 .5-.5V1.5a.5.5 0 0 0-.5-.5zM3.5 2H14v12H3.5a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5zM5 4h7v1H5V4zm0 2h7v1H5V6zm0 2h4v1H5V8z"/></svg></vscode-button>
    <span class="spacer"></span>
    <a class="back" id="communityBtn" href="/community" title="Browse and install community blocks">Community Blocks ▸</a>
    <vscode-button id="generateBtn" disabled>Generate Code</vscode-button>
  </div>
  <script>
    // Carry the open file through to the community page so it can label which
    // catalogs apply to this file's runtime vs. others.
    (function () {
      var a = document.getElementById('communityBtn');
      if (a && location.search) a.href = '/community' + location.search;
    })();
  </script>
  <div id="editorArea">
    <div id="blocklyDiv"></div>
    <div id="emptyState">
      <div class="title">No board detected</div>
      <div class="hint">Open this file inside a project containing a <code>sketch.yaml</code> to load the blocks compatible with your board.</div>
    </div>
  </div>
  <script id="l10n-data" type="application/json">${l10n.bundle}</script>
  <script id="l10n-locale" type="application/json">"${locale}"</script>
  <script id="block-messages-en" type="application/json">${l10n.blockMessages.en}</script>
  <script id="block-messages-locale" type="application/json">${l10n.blockMessages.locale}</script>
  <script>${SHIM_JS}</script>
  <script type="module" src="/webview.js"></script>
</body>
</html>`;
}
