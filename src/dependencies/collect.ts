import { CatalogEntry, Dependency } from '../catalog/CatalogTypes';

/**
 * Collectors: given the block types currently in use, gather the dependencies
 * the project needs, one function per dependency type. Dependencies live at the
 * implementation level, so an implementation contributes its dependencies if ANY
 * of its block types is used; only implementations matching the active runtime
 * are considered.
 *
 * Each type targets a different project file (the matching merger writes it):
 *   library → sketch.yaml lib_deps   (collectLibraryRequirements)
 *   pip     → requirements.txt        (collectPipRequirements)
 *   brick   → app.yaml `bricks:`      (collectBrickRequirements)
 */

export interface ProjectRequirements {
  /** sketch.yaml library specs, e.g. `Arduino_Modulino (0.8.0)`. */
  libDeps: string[];
}

export interface BrickRequirement {
  /** App Lab brick id, used verbatim as the `app.yaml` key (e.g. `arduino:web_ui`). */
  name: string;
  /** Optional brick variables forwarded into the `app.yaml` entry. */
  variables?: Record<string, string>;
}

/**
 * Compose a sketch.yaml library spec from a library dependency.
 *
 * Registry libraries → `name (minVersion)` (or bare `name` with no version).
 * VCS libraries (a git URL, e.g. Arduino_Nesso_N1) → bare `name` — sketch.yaml's
 * index-library list has no URL form. See .claude/docs/01-library-resolution.md.
 */
function composeLibrarySpec(dep: Extract<Dependency, { type: 'library' }>): string {
  if (dep.url) return dep.name;
  return dep.minVersion ? `${dep.name} (${dep.minVersion})` : dep.name;
}

/** library deps → sketch.yaml profile libraries (C++ builds). */
export function collectLibraryRequirements(
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
      if (dep.type === 'library') libDeps.add(composeLibrarySpec(dep));
    }
  }

  return { libDeps: [...libDeps] };
}

/**
 * pip deps → requirements.txt specs. Specs are `name` or `name>=minVersion` —
 * never `==` (don't pin the user to an exact version, G8).
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

/**
 * brick deps → App Lab app.yaml `bricks:`. Runs for both languages: a brick is
 * valid in either a python or a cpp impl, and the runtime scoping picks the impl
 * that owns the used blocks. De-duped by brick name; if two used impls declare
 * the same brick with different variables, the maps are shallow-merged (last key
 * wins) so a brick still appears exactly once.
 */
export function collectBrickRequirements(
  entries: CatalogEntry[],
  usedBlockTypes: Iterable<string>,
  runtime: string
): BrickRequirement[] {
  const used = new Set(usedBlockTypes);
  const byName = new Map<string, BrickRequirement>();

  for (const entry of entries) {
    const impl = entry.implementations.find(i => i.runtime.trim().toLowerCase() === runtime);
    if (!impl) continue;
    if (!impl.blocks.some(b => used.has(b.blockly?.type))) continue;

    for (const dep of impl.dependencies ?? []) {
      if (dep.type !== 'brick') continue;
      const existing = byName.get(dep.name);
      if (existing) {
        if (dep.variables) {
          existing.variables = { ...existing.variables, ...dep.variables };
        }
      } else {
        byName.set(
          dep.name,
          dep.variables ? { name: dep.name, variables: { ...dep.variables } } : { name: dep.name }
        );
      }
    }
  }

  return [...byName.values()];
}
