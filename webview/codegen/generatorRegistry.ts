import { RuntimeGenerator } from './runtimeGenerator';
import { createArduinoCppGenerator, ARDUINO_CPP_RUNTIME } from './generators/arduinoCpp';
import { createArduinoPythonGenerator, ARDUINO_PYTHON_RUNTIME } from './generators/arduinoPython';

/**
 * Registry of generation engines keyed by `runtime` (`<framework>:<language>`).
 * Add a builder here to support a new framework/language combination.
 *
 * BRICK-OWNED FORK (see tools/sync-core.sh EXCLUDE): this file diverges from
 * vscode-blockly to register the Python runtime, which upstream does not
 * implement. The Python generator itself lives in new, un-tracked files.
 */
const builders: Record<string, () => RuntimeGenerator> = {
    [ARDUINO_CPP_RUNTIME]: createArduinoCppGenerator,
    [ARDUINO_PYTHON_RUNTIME]: createArduinoPythonGenerator,
};

const cache = new Map<string, RuntimeGenerator>();

export function isRuntimeSupported(runtime: string): boolean {
    return runtime in builders;
}

/** Build (once, then cache) the generator for a runtime, or undefined if unsupported. */
export function getRuntimeGenerator(runtime: string): RuntimeGenerator | undefined {
    const build = builders[runtime];
    if (!build) return undefined;
    let rg = cache.get(runtime);
    if (!rg) {
        rg = build();
        cache.set(runtime, rg);
    }
    return rg;
}