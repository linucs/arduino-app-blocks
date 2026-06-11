import { CatalogEntry, Implementation } from './CatalogTypes';
import { BoardContext } from '../project/projectConfig';

/**
 * Compose the active runtime key from the project's framework and the source
 * language: `<framework>:<language>` (e.g. `arduino:cpp`). Both are lowercased
 * to match the canonical catalog runtime strings.
 */
export function composeRuntime(framework: string, language: string): string {
    return `${framework.trim().toLowerCase()}:${language.trim().toLowerCase()}`;
}

/**
 * An implementation is compatible with the active runtime + board when:
 *  1. its `runtime` equals the active runtime (`<framework>:<language>`), and
 *  2. its `targets` (if any) intersect the board's platform or board id.
 *     Absent `targets` means universal.
 */
export function isImplCompatible(impl: Implementation, ctx: BoardContext, runtime: string): boolean {
    if (impl.runtime.trim().toLowerCase() !== runtime) return false;

    if (impl.targets && impl.targets.length > 0) {
        const candidates = [ctx.platform, ctx.board].filter((v): v is string => !!v);
        // For Arduino CLI projects, also accept FQBN-based identifiers so catalog
        // authors can target by either PIO-style ("atmelavr") or Arduino-style
        // ("arduino:avr", "arduino:avr:uno") names.
        if (ctx.fqbn) {
            const parts = ctx.fqbn.split(':');
            if (parts.length >= 2) candidates.push(parts.slice(0, 2).join(':'));
            candidates.push(ctx.fqbn);
        }
        const wanted = new Set(candidates.map(v => v.toLowerCase()));
        if (!impl.targets.some(t => wanted.has(t.trim().toLowerCase()))) return false;
    }

    return true;
}

/**
 * Filter a catalog for a given runtime + board context. Keeps only entries with
 * at least one compatible implementation, and narrows each kept entry's
 * implementations to the compatible ones — so the webview just renders what it
 * receives, and the CodeFactory finds the right impl by runtime.
 */
export function filterEntriesForRuntime(
    entries: CatalogEntry[],
    ctx: BoardContext,
    runtime: string
): CatalogEntry[] {
    const result: CatalogEntry[] = [];
    for (const entry of entries) {
        const compatible = entry.implementations.filter(impl => isImplCompatible(impl, ctx, runtime));
        if (compatible.length === 0) continue;
        result.push({ ...entry, implementations: compatible });
    }
    return result;
}