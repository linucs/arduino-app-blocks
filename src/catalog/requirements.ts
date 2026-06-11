import { CatalogEntry, Dependency } from './CatalogTypes';

export interface ProjectRequirements {
    /** lib_deps strings, e.g. `Arduino_Modulino@^0.8.0`. */
    libDeps: string[];
}

/**
 * Compose a PlatformIO lib_deps spec from a library dependency.
 *
 * Registry libraries → `name@^minVersion` (caret = recommended by PIO).
 * VCS libraries (not in the PIO registry, e.g. Arduino_Nesso_N1) → PIO's
 * `name=url#ref` form, which gives the library a stable local name while
 * fetching from git. See .claude/docs/01-library-resolution.md.
 */
export function composePioLibDep(dep: Extract<Dependency, { type: 'library' }>): string {
    if (dep.url) {
        return `${dep.name}=${dep.url}${dep.ref ? `#${dep.ref}` : ''}`;
    }
    return dep.minVersion ? `${dep.name}@^${dep.minVersion}` : dep.name;
}

/**
 * Gather the lib_deps required by the blocks currently in use.
 *
 * Dependencies live at the implementation level, so an implementation
 * contributes its requirements if ANY of its block types is used. Only
 * implementations matching the active runtime are considered; only `library`
 * dependencies map to lib_deps (pip/brick are irrelevant to a C++ build).
 */
export function collectRequirements(
    entries: CatalogEntry[],
    usedBlockTypes: Iterable<string>,
    runtime: string
): ProjectRequirements {
    const used = new Set(usedBlockTypes);
    const libDeps = new Set<string>();

    for (const entry of entries) {
        const impl = entry.implementations.find(i => i.runtime.trim().toLowerCase() === runtime);
        if (!impl) continue;
        if (!impl.blocks.some(b => used.has(b.blockly?.type))) continue;

        for (const dep of impl.dependencies ?? []) {
            if (dep.type === 'library') libDeps.add(composePioLibDep(dep));
        }
    }

    return { libDeps: [...libDeps] };
}