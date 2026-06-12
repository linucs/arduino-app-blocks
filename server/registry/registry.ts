import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { RegistryIndex, RegistryEntry } from './types';
import { httpGet } from './remoteCatalog';
import { CatalogManager } from '../catalogManager';

/**
 * Community catalog registry — the headless model behind the brick's catalog
 * browser.
 *
 * The browsing surface itself lives in the brick's own web UI (community.ts
 * + /api/registry endpoints); this class fetches+caches the remote JSON index,
 * groups entries by vendor, marks installed, and installs (download → validate →
 * write into the app's .blocks/).
 *
 * Index source resolution:
 *   BLOCKS_CATALOG_INDEX (env) → CATALOG_REGISTRY_URL (brick variable) → default.
 * A local (non-URL) index source also makes installs read from its directory
 * (resolveLocalRoot), so the whole flow works offline against a checkout.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_INDEX_URL =
  'https://raw.githubusercontent.com/linucs/blocks-community-catalog/main/index.json';

export interface VendorGroup {
  vendor: string;
  entries: InstalledEntry[];
}

export interface InstalledEntry extends RegistryEntry {
  installed: boolean;
}

export class Registry {
  private index: RegistryIndex | undefined;
  private lastFetch = 0;
  private fetching: Promise<void> | undefined;

  constructor(private readonly catalog: CatalogManager) {}

  // --- index fetch + cache --------------------------------------------------

  private isFresh(): boolean {
    return !!this.index && Date.now() - this.lastFetch < CACHE_TTL_MS;
  }

  /** Ensure the index is loaded and fresh, fetching at most once concurrently. */
  private async ensureIndex(): Promise<void> {
    if (this.isFresh()) return;
    if (!this.fetching) {
      this.fetching = this.fetchIndex().finally(() => { this.fetching = undefined; });
    }
    await this.fetching;
  }

  private async fetchIndex(): Promise<void> {
    try {
      const source = this.resolveIndexSource();
      const buf = /^https?:\/\//i.test(source)
        ? await httpGet(source)
        : await fs.readFile(source);
      const parsed = JSON.parse(buf.toString('utf-8')) as RegistryIndex;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        throw new Error('Unsupported registry index format');
      }
      this.index = parsed;
      this.lastFetch = Date.now();
      await this.writeCache(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[registry] failed to fetch index:', msg);
      if (!this.index) {
        const cached = await this.readCache();
        if (cached) this.index = cached;
        else throw err;
      }
    }
  }

  private resolveIndexSource(): string {
    return process.env.BLOCKS_CATALOG_INDEX
      || process.env.CATALOG_REGISTRY_URL
      || DEFAULT_INDEX_URL;
  }

  /** When the index is a local path (or BLOCKS_CATALOG_ROOT is set), read installs from there. */
  private resolveLocalRoot(): string | undefined {
    if (process.env.BLOCKS_CATALOG_ROOT) return process.env.BLOCKS_CATALOG_ROOT;
    const src = process.env.BLOCKS_CATALOG_INDEX;
    if (src && !/^https?:\/\//i.test(src)) return path.dirname(src);
    return undefined;
  }

  private cacheFilePath(): string {
    const dir = process.env.CACHE_DIR || path.join(os.tmpdir(), 'blocks-author');
    return path.join(dir, 'registry-index.json');
  }

  private async writeCache(index: RegistryIndex): Promise<void> {
    try {
      const file = this.cacheFilePath();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(index));
    } catch { /* best-effort */ }
  }

  private async readCache(): Promise<RegistryIndex | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.cacheFilePath(), 'utf-8')) as RegistryIndex;
    } catch {
      return undefined;
    }
  }

  // --- browse / search ------------------------------------------------------

  private vendorOf(entry: RegistryEntry): string {
    const parts = entry.path.replace(/^catalogs\//, '').split('/');
    return parts.length > 1 ? parts[0] : '_ungrouped';
  }

  /** Path of an entry's YAML relative to the .blocks/ root (strips a leading catalogs/). */
  private relPathOf(entry: RegistryEntry): string {
    return entry.path.replace(/^catalogs\//, '');
  }

  /** Browse: vendor-grouped entries, each marked installed (by scanning .blocks/). */
  async list(blocksDirPath: string): Promise<VendorGroup[]> {
    await this.ensureIndex();
    const entries = this.index?.entries ?? [];
    const installed = await this.scanInstalled(blocksDirPath);
    const groups = new Map<string, InstalledEntry[]>();
    for (const entry of entries) {
      const vendor = this.vendorOf(entry);
      if (!groups.has(vendor)) groups.set(vendor, []);
      groups.get(vendor)!.push({ ...entry, installed: installed.has(this.relPathOf(entry)) });
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, list]) => ({
        vendor,
        entries: list.sort((a, b) => a.id.localeCompare(b.id)),
      }));
  }

  /** Search: flat, installed-marked entries whose id/description/category match q. */
  async search(q: string, blocksDirPath: string): Promise<InstalledEntry[]> {
    await this.ensureIndex();
    const installed = await this.scanInstalled(blocksDirPath);
    const needle = q.trim().toLowerCase();
    const all = (this.index?.entries ?? []).map(e => ({
      ...e,
      installed: installed.has(this.relPathOf(e)),
    }));
    if (!needle) return all;
    return all.filter(e =>
      e.id.toLowerCase().includes(needle)
      || e.category.toLowerCase().includes(needle)
      || describe(e.description).toLowerCase().includes(needle)
    );
  }

  // --- install --------------------------------------------------------------

  /**
   * Install a catalog by id: download (or read locally) its YAML, validate it
   * against block-catalog_v1 (reusing CatalogManager's AJV), then write it
   * into the app's .blocks/ at the entry's relative path. Returns the written path.
   */
  async install(id: string, blocksDirPath: string): Promise<{ path: string }> {
    await this.ensureIndex();
    const entry = this.index?.entries.find(e => e.id === id);
    if (!entry) throw new Error(`Unknown catalog id: ${id}`);

    const localRoot = this.resolveLocalRoot();
    const data = localRoot
      ? await fs.readFile(path.join(localRoot, entry.path))
      : await httpGet(entry.downloadUrl);

    // Validate every document in the file before writing anything (G6 — data, not
    // hand-patches; an invalid catalog is rejected, never silently tolerated).
    const docs = yaml.loadAll(data.toString('utf-8'));
    if (docs.length === 0) throw new Error('Catalog file is empty');
    for (const doc of docs) {
      const errors = this.catalog.validateEntry(doc);
      if (errors.length) throw new Error(`Catalog "${id}" failed validation: ${errors.join('; ')}`);
    }

    const destPath = path.join(blocksDirPath, this.relPathOf(entry));
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, data);
    return { path: destPath };
  }

  // --- installed scan -------------------------------------------------------

  /** Set of YAML paths under .blocks/, relative to it (matches relPathOf). */
  private async scanInstalled(blocksDirPath: string): Promise<Set<string>> {
    const found = new Set<string>();
    await collectYaml(blocksDirPath, blocksDirPath, found);
    return found;
  }
}

function describe(value: string | Record<string, string> | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value['en'] ?? Object.values(value)[0] ?? '';
}

async function collectYaml(dir: string, root: string, out: Set<string>): Promise<void> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // dir doesn't exist yet
  }
  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await collectYaml(full, root, out);
    } else if (/\.ya?ml$/i.test(dirent.name)) {
      out.add(path.relative(root, full));
    }
  }
}
