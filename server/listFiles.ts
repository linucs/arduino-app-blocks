import * as fs from 'fs/promises';
import * as path from 'path';
import { languageForFile, SIDECAR_EXT } from '../src/codegen/sourceLanguage';
import { companionPathFor } from './companion';

/**
 * listEditableFiles — THE one bounded file walk (Guardrail G10).
 *
 * Walks the app root once, including only files whose extension is in
 * `extensions`, and skips .git / node_modules / .blocks / hidden dirs / the
 * brick's own files. Bounded depth, no symlink following.
 */
export interface EditableFile {
  /** Path relative to the app root, POSIX-style. */
  relPath: string;
  /** 'cpp' | 'python'. */
  language: string;
  /** Whether a `.blk` sidecar already exists next to the source. */
  hasSidecar: boolean;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.blocks', 'bricks']);
const MAX_DEPTH = 8;

export async function listEditableFiles(
  appRoot: string,
  extensions: Set<string>
): Promise<EditableFile[]> {
  const results: EditableFile[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith('.') && entry.isDirectory()) continue; // hidden dirs
      if (entry.isSymbolicLink()) continue; // no symlink following
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(name).replace(/^\./, '').toLowerCase();
        if (name.endsWith(SIDECAR_EXT)) continue; // skip sidecars
        if (!extensions.has(ext)) continue;
        const language = languageForFile(name);
        if (!language) continue;
        const hasSidecar = await exists(companionPathFor(full));
        results.push({
          relPath: path.relative(appRoot, full).split(path.sep).join('/'),
          language,
          hasSidecar,
        });
      }
    }
  }

  await walk(appRoot, 0);
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return results;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.stat(p); return true; } catch { return false; }
}
