import { CatalogEntry } from '../src/catalog/CatalogTypes';

/**
 * Collect the pip packages required by the Python blocks currently in use.
 *
 * The Python analogue of src/catalog/collectRequirements (which handles only
 * `library` deps → cpp). Kept as a NEW server file so the copied, drift-guarded
 * src/catalog/requirements.ts stays byte-identical with vscode-blockly.
 *
 * Same model: dependencies live at the implementation level, so an impl
 * contributes if ANY of its block types is used; only impls matching the active
 * runtime are considered. Specs are `name` or `name>=minVersion` — never `==`
 * (G8: don't pin the user to an exact version).
 */
export function collectPipRequirements(
  entries: CatalogEntry[],
  usedBlockTypes: Iterable<string>,
  runtime: string
): string[] {
  const used = new Set(usedBlockTypes);
  const specs = new Set<string>();

  for (const entry of entries) {
    const impl = entry.implementations.find(i => i.runtime.trim().toLowerCase() === runtime);
    if (!impl) continue;
    if (!impl.blocks.some(b => used.has(b.blockly?.type))) continue;

    for (const dep of impl.dependencies ?? []) {
      if (dep.type === 'pip') {
        specs.add(dep.minVersion ? `${dep.name}>=${dep.minVersion}` : dep.name);
      }
    }
  }

  return [...specs];
}
