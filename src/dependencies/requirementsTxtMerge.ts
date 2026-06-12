/**
 * Add-only merge of pip requirements into a requirements.txt (Guardrail G8),
 * the Python analogue of sketchYamlMerge.ts (libraries).
 *
 * Strictly non-destructive: never reorders, re-pins, rewrites, or removes the
 * user's existing lines or comments — only appends packages that aren't already
 * present. Package identity follows PEP 503 normalization (lowercase; runs of
 * `-`, `_`, `.` collapse to a single `-`), so `Flask`, `flask`, and `fl_ask`
 * are treated as the same project.
 */

/** PEP 503 normalized distribution name. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, '-');
}

/** Extract the distribution name from a requirement spec or an existing line. */
function specName(line: string): string {
  // Strip comments and environment markers, then split on the first version/
  // extras operator. Good enough for identity comparison (not a full PEP 508 parse).
  const s = line.split('#')[0].split(';')[0].trim();
  const m = s.match(/^[A-Za-z0-9._-]+/);
  return m ? normalizeName(m[0]) : '';
}

function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

export function mergeRequirements(
  content: string,
  specs: string[]
): { content: string; changed: boolean } {
  if (specs.length === 0) return { content, changed: false };

  const existing = new Set(
    content.split(/\r?\n/).map(specName).filter(Boolean)
  );

  const missing = specs.filter(s => {
    const n = specName(s);
    return n && !existing.has(n);
  });
  if (missing.length === 0) return { content, changed: false };

  const eol = detectEol(content);
  // Append after existing content, ensuring a clean newline boundary. Preserve
  // the user's content verbatim; only add the missing packages.
  let head = content;
  if (head.length > 0 && !head.endsWith('\n') && !head.endsWith('\r\n')) {
    head += eol;
  }
  const block = missing.join(eol) + eol;
  return { content: head + block, changed: true };
}
