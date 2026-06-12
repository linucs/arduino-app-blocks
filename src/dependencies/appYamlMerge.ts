import type { BrickRequirement } from './collect';

/**
 * Add-only merge of required bricks into an App Lab `app.yaml` (Guardrail G8),
 * the brick analogue of sketchYamlMerge.ts (libraries) and requirementsTxtMerge.ts
 * (pip). Operates on raw lines to preserve the user's formatting.
 *
 * Strictly non-destructive: never reorders, rewrites, or removes existing brick
 * entries or other keys — only appends bricks that aren't already listed (by
 * id). App Lab owns `app.yaml` creation, so an ABSENT file is left to the caller
 * to skip; here we only ever extend an existing one.
 *
 * `app.yaml` brick list forms (see arduino-app-cli app/parser.go):
 *   bricks:
 *     - arduino:web_ui            # string form (id only)
 *     - arduino:web_ui:           # map form, details on following indented lines
 *         variables:
 *           key: value
 * The id is the namespaced name verbatim — it maps 1:1 to a catalog brick dep
 * `name`, so no translation is needed. The namespace colon is never trailing,
 * which is what lets us recover the id from a `- <id>:` line.
 */

function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/** Recover the brick id from a `- <id>` / `- <id>:` / `- <id>: value` list item. */
function brickItemId(line: string): string | undefined {
  const m = /^\s*-\s+(.*\S)\s*$/.exec(line);
  if (!m) return undefined;
  let id = m[1];
  // Inline value form `- id: value` — split on the FIRST `: ` (colon + space).
  // A namespaced id (`arduino:web_ui`) has no space after its colon, so this
  // only fires on a real inline value, leaving the id intact.
  const inline = /^(.*?):\s+\S/.exec(id);
  if (inline) return inline[1].trim();
  // Map form `- id:` — drop the single trailing colon (never the namespace one).
  if (id.endsWith(':')) id = id.slice(0, -1);
  return id.trim() || undefined;
}

/** YAML-quote a scalar only when a plain emit could be misparsed. */
function yamlScalar(v: string): string {
  if (
    v === '' ||
    /^\s|\s$/.test(v) ||
    /[:#\[\]{}&*!|>'"%@`,]/.test(v) ||
    /^[-?]/.test(v) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(v) ||
    (v.trim() !== '' && !isNaN(Number(v)))
  ) {
    return JSON.stringify(v);
  }
  return v;
}

export function mergeAppBricks(
  content: string,
  bricks: BrickRequirement[]
): { content: string; changed: boolean } {
  if (bricks.length === 0) return { content, changed: false };

  const eol = detectEol(content);
  const lines = content.split(/\r?\n/);

  // Locate the top-level `bricks:` key, including the empty-flow forms
  // `bricks: []` / `bricks: {}` that App Lab writes for a brick-less app.
  let bricksIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(bricks:)\s*(\[\s*\]|\{\s*\})?\s*$/.exec(lines[i]);
    if (m) {
      if (m[2]) lines[i] = m[1]; // strip inline empty collection → bare `bricks:`
      bricksIdx = i;
      break;
    }
  }

  const existing = new Set<string>();
  let insertIdx: number;
  const needNewKey = bricksIdx === -1;

  if (needNewKey) {
    // Append a fresh `bricks:` block after the last non-empty line.
    insertIdx = lines.length;
    while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') insertIdx--;
  } else {
    // The block spans subsequent indented or blank lines, up to the next
    // top-level key. Collect ids from its `- ` items along the way.
    insertIdx = bricksIdx + 1;
    for (let i = bricksIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') { insertIdx = i + 1; continue; }
      if (!/^\s/.test(lines[i])) break; // next top-level key
      if (lines[i].trim().startsWith('- ')) {
        const id = brickItemId(lines[i]);
        if (id) existing.add(id);
      }
      insertIdx = i + 1;
    }
    // Sit new items snug under the list, not after trailing blank lines.
    while (insertIdx > bricksIdx + 1 && lines[insertIdx - 1].trim() === '') insertIdx--;
  }

  const missing = bricks.filter(b => !existing.has(b.name));
  if (missing.length === 0) return { content, changed: false };

  const block: string[] = [];
  if (needNewKey) block.push('bricks:');
  for (const b of missing) {
    const vars = b.variables && Object.keys(b.variables).length > 0 ? b.variables : undefined;
    if (vars) {
      block.push(`  - ${b.name}:`);
      block.push(`      variables:`);
      for (const [k, val] of Object.entries(vars)) {
        block.push(`        ${k}: ${yamlScalar(val)}`);
      }
    } else {
      block.push(`  - ${b.name}`);
    }
  }

  lines.splice(insertIdx, 0, ...block);
  return { content: lines.join(eol), changed: true };
}
