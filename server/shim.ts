/**
 * acquireVsCodeApi() shim (G3).
 *
 * The webview bundle talks to its host ONLY through acquireVsCodeApi().postMessage
 * and window 'message' events. In VS Code that bridge is native; in the brick we
 * provide an identical surface backed by the /session WebSocket.
 *
 * The WS is a DUMB PIPE for the messages that genuinely need the host
 * (`ready`, `change`, `select_env`, `load_error`) — one JSON object per frame,
 * no envelope. The remaining outbound messages are UI concerns handled locally,
 * exactly as the plan specifies:
 *   - dialog_prompt/confirm/alert → native browser dialog → dialog_result (locally)
 *   - open_url                    → window.open (native, captured before the
 *                                   webview reassigns window.open)
 *   - show_docs                   → a small in-page menu
 *
 * Injected INLINE before webview.js so ordering and the native-window.open
 * capture are guaranteed.
 */
export const SHIM_JS = /* js */ `
(function () {
  // Capture the native window.open BEFORE webview.js reassigns it to a
  // postMessage shim — otherwise handling 'open_url' would recurse forever.
  var nativeOpen = window.open ? window.open.bind(window) : null;

  var HOST_BOUND = { ready: 1, change: 1, select_env: 1, load_error: 1 };

  var ws = null;
  var outQueue = [];
  var savedState;

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/session' + location.search);
    ws.onopen = function () {
      for (var i = 0; i < outQueue.length; i++) ws.send(outQueue[i]);
      outQueue = [];
    };
    ws.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      window.dispatchEvent(new MessageEvent('message', { data: data }));
    };
    ws.onclose = function () { setTimeout(connect, 1000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  connect();

  function sendHost(msg) {
    var s = JSON.stringify(msg);
    if (ws && ws.readyState === 1) ws.send(s);
    else outQueue.push(s);
  }

  function reply(id, value) {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'dialog_result', id: id, value: value } }));
  }

  function handleLocal(msg) {
    switch (msg && msg.type) {
      case 'dialog_prompt': {
        var v = window.prompt(msg.message, msg.defaultValue != null ? msg.defaultValue : '');
        reply(msg.id, v);
        return true;
      }
      case 'dialog_confirm':
        reply(msg.id, window.confirm(msg.message));
        return true;
      case 'dialog_alert':
        window.alert(msg.message);
        reply(msg.id, undefined);
        return true;
      case 'open_url':
        if (msg.url && nativeOpen) nativeOpen(msg.url, '_blank', 'noopener');
        return true;
      case 'show_docs':
        showDocs(msg.docs || []);
        return true;
    }
    return false;
  }

  function showDocs(groups) {
    // Toggle: a second click on the Docs button closes the open menu.
    var existing = document.getElementById('__docsMenu');
    if (existing) { existing.remove(); return; }

    var menu = document.createElement('div');
    menu.id = '__docsMenu';
    var WIDTH = 280;
    menu.style.cssText = 'position:absolute;z-index:9999;width:' + WIDTH + 'px;' +
      'background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-editorWidget-border);' +
      'border-radius:6px;padding:6px 4px;font-family:var(--vscode-font-family);font-size:12px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.4);color:var(--vscode-editor-foreground);';
    groups.forEach(function (g) {
      var h = document.createElement('div');
      h.textContent = g.title;
      h.style.cssText = 'font-weight:600;margin:6px 8px 2px;opacity:0.8;';
      menu.appendChild(h);
      (g.links || []).forEach(function (l) {
        var a = document.createElement('a');
        a.textContent = l.label;
        a.href = '#';
        a.style.cssText = 'display:block;padding:4px 8px;border-radius:4px;color:var(--vscode-focusBorder);text-decoration:none;';
        a.onmouseenter = function () { a.style.background = 'var(--vscode-editor-selectionBackground)'; };
        a.onmouseleave = function () { a.style.background = ''; };
        a.onclick = function (e) { e.preventDefault(); if (nativeOpen) nativeOpen(l.url, '_blank', 'noopener'); menu.remove(); };
        menu.appendChild(a);
      });
    });

    // Anchor the menu directly under the Docs button, right-edge-aligned to it,
    // clamped to the viewport — i.e. a real dropdown, not a fixed corner popup.
    document.body.appendChild(menu);
    var btn = document.getElementById('docsBtn');
    var rect = btn ? btn.getBoundingClientRect() : { left: 8, right: WIDTH + 8, bottom: 40 };
    var left = Math.min(
      Math.max(8, rect.right + window.scrollX - WIDTH),
      window.scrollX + document.documentElement.clientWidth - WIDTH - 8
    );
    menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    menu.style.left = left + 'px';

    // Dismiss on outside click / Escape.
    function onDocClick(e) { if (!menu.contains(e.target) && e.target !== btn) close(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      menu.remove();
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
    }
    setTimeout(function () {
      document.addEventListener('mousedown', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  }

  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (msg) { if (!handleLocal(msg)) sendHost(msg); },
      getState: function () { return savedState; },
      setState: function (s) { savedState = s; return s; }
    };
  };
})();
`;
