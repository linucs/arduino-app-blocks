import * as fs from 'fs/promises';
import { SIDECAR_EXT } from '../src/codegen/sourceLanguage';

/**
 * Companion `.blk` sidecar on the local filesystem (ports src/sidecar/companion.ts
 * to fs/promises + plain paths).
 *
 * DELIBERATE DIVERGENCE from vscode-blockly (Guardrail G5, decided in the plan):
 * the sidecar is keyed by the FULL filename, not the basename —
 *   sketch.ino  -> sketch.ino.blk
 *   main.py     -> main.py.blk
 * The brick edits many files via a picker, so basename keying (main.py + main.cpp
 * -> main.blk) could collide. Full-filename is collision-proof and matches App
 * Lab's own `<file>.blocks` precedent. This path is computed in EXACTLY ONE place.
 */
export function companionPathFor(sourcePath: string): string {
  return sourcePath + SIDECAR_EXT;
}

/**
 * Read the stored Blockly workspace, or undefined if there is none yet.
 * Accepts both the raw-workspace form and a `{ workspace }` wrapper.
 */
export async function readCompanionWorkspace(companionPath: string): Promise<unknown | undefined> {
  let text: string;
  try {
    text = await fs.readFile(companionPath, 'utf8');
  } catch {
    return undefined;
  }
  if (!text.trim()) return undefined;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && 'workspace' in data) {
      return (data as { workspace: unknown }).workspace;
    }
    return data;
  } catch {
    return undefined;
  }
}

export async function writeCompanionWorkspace(companionPath: string, workspace: unknown): Promise<void> {
  const text = JSON.stringify(workspace ?? {}, null, 2);
  await fs.writeFile(companionPath, text, 'utf8');
}

export async function companionExists(companionPath: string): Promise<boolean> {
  try {
    await fs.stat(companionPath);
    return true;
  } catch {
    return false;
  }
}
