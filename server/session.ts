import * as fs from 'fs/promises';
import * as path from 'path';
import type { WebSocket } from 'ws';
import { filterEntriesForRuntime } from '../src/catalog/boardFilter';
import { collectRequirements } from '../src/catalog/requirements';
import { collectUsedBlockTypes } from '../src/project/blockUsage';
import { mergeSketchLibraries } from '../src/project/arduino/sketchYamlMerge';
import { collectPipRequirements } from './pipRequirements';
import { mergeRequirements } from './requirementsTxt';
import { BoardContext } from '../src/project/projectConfig';
import { CatalogEntry } from '../src/catalog/CatalogTypes';
import { CatalogManager } from './catalogManager';
import { resolveFileContext, FileContext } from './fileContext';
import {
  readCompanionWorkspace,
  writeCompanionWorkspace,
} from './companion';

/**
 * Per-connection editing session — the thin host adapter (Guardrail G2).
 *
 * This is the port of BlocksEditorProvider.resolveCustomTextEditor: identical
 * control flow, swapping ONLY IO (vscode.workspace.fs → fs/promises) and
 * transport (webview.postMessage → the /session WebSocket). It re-implements no
 * catalog/codegen/merge logic — it calls the same pure functions the extension
 * does (filterEntriesForRuntime, collectRequirements, collectUsedBlockTypes,
 * mergeSketchLibraries) via resolveFileContext (G4).
 *
 * Session model (G12): one session keyed by the open file path. The .blk is the
 * sole source of truth; reconnect re-sends init_catalog + update from disk.
 */
export interface SessionConfig {
  generateMode: 'auto' | 'manual';
  showMinimap: boolean;
  defaultFqbn?: string;
  /** App root (bind-mounted /app) — holds the project-local .blocks/ dir. */
  appRoot: string;
}

export class Session {
  private ctx?: FileContext;
  private projectLocalEntries: CatalogEntry[] = [];

  constructor(
    private readonly ws: WebSocket,
    private readonly sourcePath: string,
    private readonly catalog: CatalogManager,
    private readonly config: SessionConfig
  ) {}

  attach(): void {
    this.ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      void this.handle(msg);
    });
  }

  private post(msg: unknown): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async handle(msg: any): Promise<void> {
    switch (msg?.type) {
      case 'ready':
        await this.refresh();
        await this.sendUpdate();
        this.post({ type: 'set_mode', autoGenerate: this.config.generateMode === 'auto' });
        this.post({ type: 'set_minimap', show: this.config.showMinimap });
        return;

      case 'select_env':
        // Inert in the brick (single sketch.yaml profile). Re-send for parity.
        await this.sendCatalog();
        return;

      case 'change':
        await writeCompanionWorkspace(this.companionPath(), msg.state);
        if (typeof msg.code === 'string') {
          await this.applyCode(msg.code, msg.state);
        }
        return;

      case 'load_error':
        console.warn(`[session] workspace load error (${this.sourcePath}): ${msg.error}`);
        return;

      // dialog_prompt / dialog_confirm / dialog_alert / open_url / show_docs are
      // handled client-side by the shim and never reach the host (G3).
    }
  }

  /** Re-resolve the file context (board/runtime) and push the filtered catalog. */
  private async refresh(): Promise<void> {
    this.ctx = await resolveFileContext(this.sourcePath, {
      defaultFqbn: this.config.defaultFqbn,
      log: (m) => console.log(m),
    });
    const blocksDir = path.join(this.config.appRoot, '.blocks');
    this.projectLocalEntries = await this.catalog.loadEntriesFrom(blocksDir);
    this.sendCatalog();
  }

  private async sendCatalog(): Promise<void> {
    if (!this.ctx) await this.refresh();
    const ctx = this.ctx!;
    const runtime = ctx.runtime;
    const isPython = ctx.language === 'python';
    const hasBoard = isPython ? true : !!ctx.boardContext;
    const framework = runtime ? 'arduino' : undefined;

    const allEntries = [...this.catalog.getEntries(), ...this.projectLocalEntries];
    // Python is board-independent: filter by runtime against an empty board ctx.
    const boardCtx: BoardContext = ctx.boardContext ?? { envName: '' };
    const entries = hasBoard && runtime
      ? filterEntriesForRuntime(allEntries, boardCtx, runtime)
      : [];

    this.post({
      type: 'init_catalog',
      hasBoard,
      framework,
      runtime,
      configType: 'arduino',
      // No profile/environment dropdown in the brick — the board is fixed by the
      // single sketch.yaml profile (or DEFAULT_FQBN). Empty envs hides the picker.
      envs: [],
      selectedEnv: undefined,
      entries,
    });
  }

  private async sendUpdate(): Promise<void> {
    const state = await readCompanionWorkspace(this.companionPath());
    this.post({ type: 'update', state });
  }

  private async applyCode(code: string, state: unknown): Promise<void> {
    try {
      await this.writeSource(code);
      await this.syncDependencies(state);
      this.post({ type: 'generation_result', ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'generation_result', ok: false, error: message });
    }
  }

  private async writeSource(code: string): Promise<void> {
    let current: string | undefined;
    try { current = await fs.readFile(this.sourcePath, 'utf8'); } catch { /* new file */ }
    if (current === code) return;
    await fs.writeFile(this.sourcePath, code, 'utf8');
  }

  /**
   * Add-only merge of the dependencies required by blocks in use (G8), dispatched
   * by runtime: cpp → sketch.yaml profile libraries; python → requirements.txt.
   * Both are non-destructive and do a fresh read immediately before the merge+write
   * (never from a cached copy).
   */
  private async syncDependencies(state: unknown): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !ctx.runtime) return;
    const used = collectUsedBlockTypes(state);
    const allEntries = [...this.catalog.getEntries(), ...this.projectLocalEntries];

    if (ctx.language === 'python') {
      const specs = collectPipRequirements(allEntries, used, ctx.runtime);
      if (specs.length === 0) return;
      // requirements.txt lives next to the Python source.
      const reqPath = path.join(path.dirname(this.sourcePath), 'requirements.txt');
      let content = '';
      try { content = await fs.readFile(reqPath, 'utf8'); } catch { /* create it */ }
      const { content: merged, changed } = mergeRequirements(content, specs);
      if (changed) await fs.writeFile(reqPath, merged, 'utf8');
      return;
    }

    // cpp → sketch.yaml profile libraries.
    if (ctx.language !== 'cpp' || !ctx.project || !ctx.boardContext || !ctx.activeEnvName) return;
    const reqs = collectRequirements(allEntries, used, ctx.runtime);
    if (reqs.libDeps.length === 0) return;

    let content: string;
    try {
      content = await fs.readFile(ctx.project.configPath, 'utf8');
    } catch {
      return;
    }
    const { content: merged, changed } = mergeSketchLibraries(content, ctx.activeEnvName, {
      libDeps: reqs.libDeps,
    });
    if (changed) await fs.writeFile(ctx.project.configPath, merged, 'utf8');
  }

  private companionPath(): string {
    return this.ctx ? this.ctx.companionPath : this.sourcePath + '.blk';
  }
}
