import { RuntimeGenerator } from './runtimeGenerator';
import { createArduinoCppGenerator, ARDUINO_CPP_RUNTIME } from './generators/arduinoCpp';

/**
 * Registry of generation engines keyed by `runtime` (`<framework>:<language>`).
 * Add a builder here to support a new framework/language combination.
 */
const builders: Record<string, () => RuntimeGenerator> = {
    [ARDUINO_CPP_RUNTIME]: createArduinoCppGenerator,
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