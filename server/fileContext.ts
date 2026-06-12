import { languageForFile } from '../src/codegen/sourceLanguage';
import { composeRuntime } from '../src/catalog/boardFilter';
import {
  ProjectConfig,
  ProjectEnv,
  BoardContext,
  resolveActiveEnv,
  toBoardContext,
} from '../src/project/projectConfig';
import { loadArduinoProject } from './arduinoProject';
import { companionPathFor } from './companion';

/**
 * resolveFileContext — THE single resolver (Guardrail G4).
 *
 * All of {extension→language, language→runtime, python⇒no board,
 * cpp⇒fqbn fallback chain, fqbn validity} lives here and nowhere else. The rest
 * of the server consumes the resolved context; no board/runtime logic is
 * scattered across server/webview.
 *
 * In the brick the framework is the constant `arduino` and there is exactly one
 * profile, so runtime is a pure function of the file extension. Only the C++ path
 * consults sketch.yaml (board context for `targets` filtering + the library merge
 * target); the Python path is board-independent.
 */

const FRAMEWORK = 'arduino';

export interface FileContext {
  sourcePath: string;
  companionPath: string;
  /** 'cpp' | 'python' | undefined (unsupported extension). */
  language: string | undefined;
  /** 'arduino:cpp' | 'arduino:python' | undefined. */
  runtime: string | undefined;
  /** Loaded sketch.yaml config (cpp only; undefined for python or when absent). */
  project?: ProjectConfig;
  /** Board context for filterEntriesForRuntime (cpp only). */
  boardContext?: BoardContext;
  /** Active profile name — the library-merge target (cpp only). */
  activeEnvName?: string;
  /** True when the board context came from the DEFAULT_FQBN fallback. */
  usedDefaultFqbn?: boolean;
}

/** An fqbn is valid iff it has exactly 3 non-empty `:`-separated segments. */
export function isValidFqbn(fqbn: string | undefined): fqbn is string {
  if (!fqbn) return false;
  const parts = fqbn.split(':');
  return parts.length === 3 && parts.every(p => p.trim().length > 0);
}

/** Derive a ProjectEnv from a raw fqbn (board=seg3, platform=seg1:seg2, framework=arduino). */
function envFromFqbn(name: string, fqbn: string): ProjectEnv {
  const parts = fqbn.split(':');
  return {
    name,
    platform: parts.slice(0, 2).join(':'),
    board: parts[2],
    framework: FRAMEWORK,
    fqbn,
  };
}

export interface ResolveOptions {
  /** DEFAULT_FQBN brick variable — last-resort board context for the cpp path. */
  defaultFqbn?: string;
  /** Logger for the fallback notice (G4: log when DEFAULT_FQBN is used). */
  log?: (msg: string) => void;
}

export async function resolveFileContext(
  sourcePath: string,
  opts: ResolveOptions = {}
): Promise<FileContext> {
  const language = languageForFile(sourcePath);
  const companionPath = companionPathFor(sourcePath);

  if (!language) {
    return { sourcePath, companionPath, language: undefined, runtime: undefined };
  }

  const runtime = composeRuntime(FRAMEWORK, language);

  // Python is board-independent — it never consults sketch.yaml.
  if (language !== 'cpp') {
    return { sourcePath, companionPath, language, runtime };
  }

  // C++: derive board context from the single sketch.yaml profile, with the
  // fallback chain: profiles.<active>.fqbn → top-level default_fqbn → DEFAULT_FQBN.
  // (default_fqbn is already folded into a synthesized env by parseSketchYaml when
  // no profiles exist, so it is covered by resolveActiveEnv below.)
  const project = await loadArduinoProject(sourcePath);
  const activeEnv = project ? resolveActiveEnv(project, undefined) : undefined;

  if (activeEnv && isValidFqbn(activeEnv.fqbn)) {
    return {
      sourcePath, companionPath, language, runtime,
      project,
      boardContext: toBoardContext(activeEnv),
      activeEnvName: activeEnv.name,
    };
  }

  // Fall back to DEFAULT_FQBN.
  if (opts.defaultFqbn && isValidFqbn(opts.defaultFqbn)) {
    opts.log?.(
      `[fileContext] sketch.yaml fqbn missing/invalid for ${sourcePath}; using DEFAULT_FQBN=${opts.defaultFqbn}`
    );
    const env = envFromFqbn(activeEnv?.name ?? '', opts.defaultFqbn);
    return {
      sourcePath, companionPath, language, runtime,
      project,
      boardContext: toBoardContext(env),
      activeEnvName: env.name,
      usedDefaultFqbn: true,
    };
  }

  // No valid board context at all — the webview shows its "No board detected" state.
  return { sourcePath, companionPath, language, runtime, project, activeEnvName: activeEnv?.name };
}
