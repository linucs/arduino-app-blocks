import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectConfig } from '../src/project/projectConfig';
import { parseSketchYaml } from '../src/project/arduino/sketchYaml';

/**
 * Filesystem locate-and-load for the Arduino sketch.yaml governing a document.
 * The pure parse (parseSketchYaml) lives in src/; this is the host IO around it.
 */

/** Walk up from a starting file/dir path looking for a sketch.yaml. */
export async function findSketchYaml(startFsPath: string): Promise<string | undefined> {
  let dir = startFsPath;
  try {
    if ((await fs.stat(startFsPath)).isFile()) dir = path.dirname(startFsPath);
  } catch {
    dir = path.dirname(startFsPath);
  }

  let prev = '';
  while (dir && dir !== prev) {
    const candidate = path.join(dir, 'sketch.yaml');
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch { /* keep climbing */ }
    prev = dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

/** Locate and parse the sketch.yaml governing the given document path. */
export async function loadArduinoProject(documentFsPath: string): Promise<ProjectConfig | undefined> {
  const yamlPath = await findSketchYaml(documentFsPath);
  if (!yamlPath) return undefined;
  try {
    const content = await fs.readFile(yamlPath, 'utf-8');
    const { envs, defaultEnvs } = parseSketchYaml(content);
    return { configPath: yamlPath, envs, defaultEnvs };
  } catch {
    return undefined;
  }
}
