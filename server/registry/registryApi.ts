import * as http from 'http';
import { Registry } from './registry';

/**
 * REST surface for the Community Blocks page (Workstream G / M3).
 *
 *   GET  /api/registry            → vendor-grouped entries, each Installed/not
 *   GET  /api/registry/search?q=  → flat filtered entries
 *   POST /api/registry/install    → { id } → download + validate + write to .blocks/
 *
 * Thin transport only: all logic lives in Registry. Returns JSON; the page
 * renders client-side. `blocksDirPath` is the single .blocks/ dir (G5), passed in.
 */

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req: http.IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Handle an /api/registry* request. Returns true if it owned the request.
 * `onInstalled` lets the caller signal connected sessions to re-filter live.
 */
export async function handleRegistryApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  registry: Registry,
  blocksDirPath: string,
  onInstalled: () => void
): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/registry' && p !== '/api/registry/search' && p !== '/api/registry/install') {
    return false;
  }

  try {
    if (p === '/api/registry' && req.method === 'GET') {
      json(res, 200, { vendors: await registry.list(blocksDirPath) });
      return true;
    }

    if (p === '/api/registry/search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      json(res, 200, { entries: await registry.search(q, blocksDirPath) });
      return true;
    }

    if (p === '/api/registry/install' && req.method === 'POST') {
      const body = await readBody(req);
      let id: unknown;
      try { id = JSON.parse(body)?.id; } catch { /* fall through */ }
      if (typeof id !== 'string' || !id) {
        json(res, 400, { ok: false, error: 'missing id' });
        return true;
      }
      const result = await registry.install(id, blocksDirPath);
      onInstalled();
      json(res, 200, { ok: true, path: result.path });
      return true;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[registryApi] error:', message);
    json(res, 500, { ok: false, error: message });
    return true;
  }
}
