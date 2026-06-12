import * as yaml from 'js-yaml';
import { ProjectEnv, DEFAULT_ENV_NAME } from '../projectConfig';

interface SketchProfile {
    fqbn?: string;
    platforms?: Array<{ platform?: string; platform_index_url?: string }>;
    libraries?: string[];
    notes?: string;
}

interface SketchYaml {
    profiles?: Record<string, SketchProfile>;
    default_fqbn?: string;
    default_profile?: string;
}

/**
 * Parse a sketch.yaml and extract profiles as ProjectEnv entries.
 *
 * FQBN format: `vendor:arch:board` (e.g. `arduino:avr:uno`).
 * - `board`     = 3rd segment
 * - `framework` = 1st segment (always "arduino" for Arduino CLI)
 * - `platform`  = from profiles's platforms[0].platform, else first two FQBN segments
 */
export function parseSketchYaml(content: string): { envs: ProjectEnv[]; defaultEnvs: string[] } {
    const doc = yaml.load(content) as SketchYaml | null;
    if (!doc || typeof doc !== 'object') return { envs: [], defaultEnvs: [] };

    const envs: ProjectEnv[] = [];

    if (doc.profiles && typeof doc.profiles === 'object') {
        for (const [name, profile] of Object.entries(doc.profiles)) {
            if (!profile || typeof profile !== 'object') continue;
            envs.push(profileToEnv(name, profile));
        }
    }

    // Synthesize a default env from default_fqbn when no profiles exist.
    // This covers the common case of `arduino-cli board attach` which only
    // writes default_fqbn/default_port/default_protocol — no profiles.
    if (envs.length === 0 && doc.default_fqbn && typeof doc.default_fqbn === 'string') {
        envs.push(profileToEnv(DEFAULT_ENV_NAME, { fqbn: doc.default_fqbn.trim() }));
    }

    const defaultEnvs: string[] = [];
    if (doc.default_profile && typeof doc.default_profile === 'string') {
        defaultEnvs.push(doc.default_profile.trim());
    }

    return { envs, defaultEnvs };
}

function profileToEnv(name: string, profile: SketchProfile): ProjectEnv {
    const fqbn = profile.fqbn?.trim();
    const parts = fqbn?.split(':') ?? [];

    const board = parts.length >= 3 ? parts[2] : undefined;
    // sketch.yaml is an Arduino CLI file — the framework is always "arduino".
    // The first FQBN segment is the vendor/package (e.g. "esp32", "adafruit"),
    // not the framework.
    const framework = fqbn ? 'arduino' : undefined;

    let platform: string | undefined;
    if (profile.platforms && profile.platforms.length > 0 && profile.platforms[0].platform) {
        // Strip optional version suffix: "esp32:esp32 (3.3.8)" → "esp32:esp32"
        platform = stripVersion(profile.platforms[0].platform.trim());
    } else if (parts.length >= 2) {
        platform = parts.slice(0, 2).join(':');
    }

    return { name, platform, board, framework, fqbn };
}

/** Strip an optional `(version)` suffix: `"esp32:esp32 (3.3.8)"` → `"esp32:esp32"`. */
function stripVersion(s: string): string {
    return s.replace(/\s*\(.*\)\s*$/, '').trim();
}