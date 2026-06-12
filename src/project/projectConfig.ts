/** Sentinel name for a synthesized default env (no named profile/environment). */
export const DEFAULT_ENV_NAME = '';

/** Resolved configuration for a single build environment / profile. */
export interface ProjectEnv {
    /** Environment or profile name. */
    name: string;
    /** Platform id from the sketch.yaml `platforms:` entry, or the first two FQBN segments. */
    platform?: string;
    board?: string;
    framework?: string;
    /** Original Arduino FQBN (e.g. `arduino:avr:uno`). */
    fqbn?: string;
}

/** Parsed project configuration from sketch.yaml. */
export interface ProjectConfig {
    /** Absolute path to the config file that was parsed. */
    configPath: string;
    /** All environments/profiles, in file order. */
    envs: ProjectEnv[];
    /** Fallback environment names in priority order. */
    defaultEnvs: string[];
}

/** Board context that drives catalog filtering for the active environment. */
export interface BoardContext {
    envName: string;
    platform?: string;
    board?: string;
    framework?: string;
    /** Original Arduino FQBN for extended target matching. */
    fqbn?: string;
}

/** Pick the active env: a requested one if valid, else defaultEnvs[0], else the first env. */
export function resolveActiveEnv(project: ProjectConfig, requested?: string): ProjectEnv | undefined {
    if (requested !== undefined) {
        const found = project.envs.find(e => e.name === requested);
        if (found) return found;
    }
    for (const name of project.defaultEnvs) {
        const found = project.envs.find(e => e.name === name);
        if (found) return found;
    }
    return project.envs[0];
}

export function toBoardContext(env: ProjectEnv): BoardContext {
    return {
        envName: env.name,
        platform: env.platform,
        board: env.board,
        framework: env.framework,
        fqbn: env.fqbn,
    };
}