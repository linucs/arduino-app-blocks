import * as path from 'path';

/**
 * THE single project-local catalogs-dir resolver (Guardrail G5).
 *
 * The community-catalogs dir lives at the app root — the bind-mounted `/app/.blocks`
 * (on the Q this is `~/ArduinoApps/<app_name>/.blocks`). It is NOT sketch-scoped, so
 * installed community blocks are shared across both runtimes (`.ino` and `.py`) and
 * work even for Python-only apps with no `sketch.yaml`.
 *
 * Both the install target and the load path resolve here, for every file, computed
 * in this one place. Env-overridable via BLOCKS_DIR for tests.
 */
export function blocksDir(appRoot: string): string {
  const override = process.env.BLOCKS_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(appRoot, '.blocks');
}
