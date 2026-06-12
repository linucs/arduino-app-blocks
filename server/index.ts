import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import chokidar from 'chokidar';
import { WebSocketServer } from 'ws';
import { CatalogManager } from './catalogManager';
import { Registry, handleRegistryApi, renderCommunityHtml } from './registry';
import { blocksDir } from './blocksDir';
import { Session, SessionConfig } from './session';
import { renderEditorHtml } from './html';
import { loadL10n } from './l10n';
import { listEditableFiles } from './listFiles';
import { languageForFile } from '../src/codegen/sourceLanguage';
import { composeRuntime } from '../src/catalog/boardFilter';
import themeCss from './assets/theme.css';

/**
 * Brick HTTP/WebSocket host.
 *
 * Routes:
 *   GET /            → file picker (or redirect to the single editable file)
 *   GET /edit?file=  → Blockly editor HTML
 *   GET /webview.js  → the browser bundle (cpp + later python generators)
 *   GET /assets/*    → theme.css (the closed --vscode-* token set, G9)
 *   GET /health      → 200 only when serving AND catalogs loaded (G11)
 *   WS  /session     → the postMessage protocol, one JSON object per frame (G3)
 */

// --- configuration (brick variables → env vars) ----------------------------
const PORT = parseInt(process.env.PORT || '7100', 10);
// Container app root = the bind-mount target, always `/app`. Do NOT read
// APP_HOME here: under the App Lab daemon APP_HOME is the *host* app dir (used
// for `${APP_HOME}` volume interpolation), which does not exist inside the
// container. APP_ROOT is our own override, only needed when running the server
// outside a container (dev / `npm run preview`).
const APP_ROOT = path.resolve(process.env.APP_ROOT || '/app');
// Resources bundled with the brick (catalogs/, l10n/) live next to dist/.
const RESOURCE_ROOT = path.resolve(process.env.RESOURCE_ROOT || path.join(__dirname, '..'));
const BUILTIN_CATALOGS_DIR = path.join(RESOURCE_ROOT, 'catalogs');
const WEBVIEW_JS = path.join(__dirname, 'webview.js');

const EDITABLE_EXTENSIONS = new Set(
  (process.env.EDITABLE_EXTENSIONS || 'ino,cpp,py')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);
const GENERATE_MODE = process.env.GENERATE_MODE === 'manual' ? 'manual' : 'auto';
const SHOW_MINIMAP = /^(1|true|yes)$/i.test(process.env.SHOW_MINIMAP || '');
const DEFAULT_FQBN = process.env.DEFAULT_FQBN || 'arduino:zephyr:unoq';

function sessionConfig(): SessionConfig {
  return { generateMode: GENERATE_MODE, showMinimap: SHOW_MINIMAP, defaultFqbn: DEFAULT_FQBN, appRoot: APP_ROOT };
}

// --- shared state ----------------------------------------------------------
const catalog = new CatalogManager(BUILTIN_CATALOGS_DIR);
const registry = new Registry(catalog);
let catalogsReady = false;

/** Active editing sessions — notified to re-filter their toolbox on .blocks/ changes. */
const sessions = new Set<Session>();

/** Re-push the filtered catalog to every open session (M3 live update). */
function refreshAllSessions(): void {
  for (const s of sessions) void s.refreshCatalog();
}

function localeFromRequest(req: http.IncomingMessage): string {
  if (process.env.LOCALE) return process.env.LOCALE;
  const header = req.headers['accept-language'];
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0].trim().toLowerCase() || 'en';
  }
  return 'en';
}

/** Resolve a `?file=` query value to an absolute path strictly inside APP_ROOT. */
function resolveRequestedFile(rel: string): string | undefined {
  const abs = path.resolve(APP_ROOT, rel);
  if (abs !== APP_ROOT && !abs.startsWith(APP_ROOT + path.sep)) return undefined;
  const ext = path.extname(abs).replace(/^\./, '').toLowerCase();
  if (!EDITABLE_EXTENSIONS.has(ext) || !languageForFile(abs)) return undefined;
  return abs;
}

function send(res: http.ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function badgeFor(language: string): string {
  return language === 'python' ? 'Py' : 'C++';
}

function renderPicker(files: { relPath: string; language: string; hasSidecar: boolean }[]): string {
  const rows = files.map(f => `
    <li>
      <span class="badge">${badgeFor(f.language)}</span>
      <a href="/edit?file=${encodeURIComponent(f.relPath)}">${f.relPath}</a>
      <span class="state">${f.hasSidecar ? '• has blocks' : '— no blocks'}</span>
    </li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Programming</title><link rel="stylesheet" href="/assets/theme.css">
    <style>
      body { font-family: var(--vscode-font-family); padding: 24px; }
      h1 { font-size: 16px; }
      ul { list-style: none; padding: 0; max-width: 560px; }
      li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; margin-bottom: 8px; }
      .badge { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
      a { color: var(--vscode-focusBorder); text-decoration: none; flex: 1; }
      .state { font-size: 12px; opacity: 0.6; }
      .empty { opacity: 0.7; }
    </style></head>
    <body><h1>Choose a file to edit with blocks</h1>
    ${files.length ? `<ul>${rows}</ul>` : '<p class="empty">No editable files found under the app folder.</p>'}
    <p><a href="/community" style="color: var(--vscode-focusBorder); text-decoration: none;">Manage community blocks ▸</a></p>
    </body></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/health') {
      if (catalogsReady) return send(res, 200, 'text/plain', 'ok');
      return send(res, 503, 'text/plain', 'starting');
    }

    if (pathname === '/assets/theme.css') {
      return send(res, 200, 'text/css; charset=utf-8', themeCss);
    }

    if (pathname === '/webview.js' || pathname === '/webview.js.map') {
      try {
        const body = await fs.readFile(path.join(path.dirname(WEBVIEW_JS), path.basename(pathname)));
        const ct = pathname.endsWith('.map') ? 'application/json' : 'text/javascript; charset=utf-8';
        return send(res, 200, ct, body);
      } catch {
        return send(res, 404, 'text/plain', 'not found');
      }
    }

    if (pathname.startsWith('/api/registry')) {
      const owned = await handleRegistryApi(
        req, res, url, registry, blocksDir(APP_ROOT), refreshAllSessions
      );
      if (owned) return;
      return send(res, 404, 'text/plain', 'not found');
    }

    if (pathname === '/community') {
      const rel = url.searchParams.get('file') || '';
      const abs = rel ? resolveRequestedFile(rel) : undefined;
      const language = abs ? languageForFile(abs) : undefined;
      const runtimeHint = language ? composeRuntime('arduino', language) : undefined;
      return send(res, 200, 'text/html; charset=utf-8', renderCommunityHtml(runtimeHint));
    }

    if (pathname === '/') {
      const files = await listEditableFiles(APP_ROOT, EDITABLE_EXTENSIONS);
      if (files.length === 1) {
        res.writeHead(302, { Location: `/edit?file=${encodeURIComponent(files[0].relPath)}` });
        return res.end();
      }
      return send(res, 200, 'text/html; charset=utf-8', renderPicker(files));
    }

    if (pathname === '/edit') {
      const rel = url.searchParams.get('file') || '';
      const abs = resolveRequestedFile(rel);
      if (!abs) return send(res, 400, 'text/plain', 'invalid file');
      const l10n = await loadL10n(RESOURCE_ROOT, localeFromRequest(req));
      return send(res, 200, 'text/html; charset=utf-8', renderEditorHtml(l10n));
    }

    return send(res, 404, 'text/plain', 'not found');
  } catch (err) {
    console.error('[server] request error:', err);
    return send(res, 500, 'text/plain', 'internal error');
  }
});

// --- WebSocket: /session?file=<rel> ----------------------------------------
const wss = new WebSocketServer({ server, path: '/session' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const rel = url.searchParams.get('file') || '';
  const abs = resolveRequestedFile(rel);
  if (!abs) { ws.close(1008, 'invalid file'); return; }
  const session = new Session(ws, abs, catalog, sessionConfig());
  sessions.add(session);
  ws.on('close', () => sessions.delete(session));
  session.attach();
});

/**
 * Watch the project-local .blocks/ for catalog changes (install or hand-edit) and
 * re-push the filtered toolbox to every open session (M3 live update). One watcher
 * for the whole server; the dir need not exist yet.
 */
function watchBlocksDir(): void {
  const dir = blocksDir(APP_ROOT);
  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  const onChange = (p: string) => {
    if (!/\.ya?ml$/i.test(p)) return;
    console.log(`[server] .blocks change: ${p}`);
    refreshAllSessions();
  };
  watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
}

async function main(): Promise<void> {
  await catalog.init();
  catalogsReady = true;
  watchBlocksDir();
  server.listen(PORT, () => {
    console.log(`[server] blocks-author listening on :${PORT}`);
    console.log(`[server] app root: ${APP_ROOT}`);
    console.log(`[server] catalogs: ${BUILTIN_CATALOGS_DIR}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
