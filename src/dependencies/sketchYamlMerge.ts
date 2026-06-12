import { DEFAULT_ENV_NAME } from '../project/projectConfig';

/**
 * Non-destructive merge of library dependencies into a specific profile
 * of a sketch.yaml. Add-only: never removes user entries, only the
 * targeted profile is touched, and duplicates are skipped (de-duped by
 * library name, case-insensitive).
 *
 * Operates on raw lines to preserve the user's formatting.
 *
 * sketch.yaml library format (index libs):   `- LibName (version)`
 * Library specs arrive already in this form (see collectLibraryRequirements).
 */

/**
 * Extract the library identity (name) from a sketch.yaml library entry.
 * Handles: `LibName (1.0.0)`, `LibName`, `dependency: LibName (1.0.0)`.
 */
function sketchLibIdentity(entry: string): string {
    let s = entry.trim();
    if (s.startsWith('dependency:')) s = s.slice('dependency:'.length).trim();
    if (s.startsWith('dir:')) return s;
    const parenIdx = s.indexOf('(');
    return (parenIdx !== -1 ? s.slice(0, parenIdx) : s).trim().toLowerCase();
}


function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Find the line range for a profile's `libraries:` block.
 * Returns the range of the libraries list items (not the `libraries:` key itself).
 */
function findLibrariesRange(
    lines: string[],
    profileName: string
): { profileStart: number; libKeyIdx: number; libStart: number; libEnd: number } | undefined {
    // Find `profiles:` top-level key
    let profilesIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^profiles:\s*$/.test(lines[i])) { profilesIdx = i; break; }
    }
    if (profilesIdx === -1) return undefined;

    // Find the target profile (indented under profiles:)
    const profileRe = new RegExp(`^\\s{2}${escapeRegex(profileName)}:\\s*$`);
    let profileStart = -1;
    for (let i = profilesIdx + 1; i < lines.length; i++) {
        if (profileRe.test(lines[i])) { profileStart = i; break; }
        if (/^\S/.test(lines[i])) break;
    }
    if (profileStart === -1) return undefined;

    // Find `libraries:` within this profile
    let libKeyIdx = -1;
    for (let i = profileStart + 1; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        // Hit next profile or top-level key
        if (/^\S/.test(lines[i]) || (/^\s{2}\S/.test(lines[i]) && !lines[i].trim().startsWith('-') && !lines[i].trim().startsWith('libraries'))) {
            if (/^\s{2}\S/.test(lines[i]) && !lines[i].trim().startsWith('-')) break;
            if (/^\S/.test(lines[i])) break;
        }
        // Match the profile's `libraries:` key, including the flow-style empty
        // forms `libraries: []` / `libraries: {}` that arduino-cli emits for a
        // profile with no libraries. Without this, the inline `[]` slips past a
        // bare-key-only regex, libKeyIdx stays -1, and the caller inserts a
        // SECOND `libraries:` block — corrupting sketch.yaml with a duplicate key.
        const libMatch = /^(\s+libraries:)\s*(\[\s*\]|\{\s*\})?\s*$/.exec(lines[i]);
        if (libMatch) {
            // Strip the inline empty collection so the line becomes a bare
            // `libraries:` key; the empty-block append path then writes proper
            // block-style items under it.
            if (libMatch[2]) lines[i] = libMatch[1];
            libKeyIdx = i;
            break;
        }
    }

    if (libKeyIdx === -1) {
        return { profileStart, libKeyIdx: -1, libStart: -1, libEnd: -1 };
    }

    // Collect library list items (lines starting with `      - `)
    const libStart = libKeyIdx + 1;
    let libEnd = libStart;
    for (let i = libStart; i < lines.length; i++) {
        if (/^\s+- /.test(lines[i]) && indentOf(lines[i]) > indentOf(lines[libKeyIdx])) {
            libEnd = i + 1;
        } else if (lines[i].trim() === '') {
            libEnd = i + 1;
        } else {
            break;
        }
    }

    return { profileStart, libKeyIdx, libStart, libEnd };
}

function indentOf(line: string): number {
    const match = /^(\s*)/.exec(line);
    return match ? match[1].length : 0;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mergeSketchLibraries(
    content: string,
    profileName: string,
    additions: { libDeps?: string[] }
): { content: string; changed: boolean } {
    const deps = additions.libDeps ?? [];
    if (deps.length === 0) return { content, changed: false };

    // No real profile exists (the active env is the in-memory env synthesized
    // from `default_fqbn` — see parseSketchYaml). In that case the project is in
    // arduino-cli's profile-less/global mode, where libraries are resolved by
    // `#include` discovery against globally-installed libraries, not from
    // sketch.yaml. Writing a synthesized profile here would manufacture an
    // incomplete profile (no `platforms:`) and overstep arduino-cli's ownership
    // of profile creation, so we write nothing. Profile completeness is
    // arduino-cli's responsibility (ProfileCreate); blockly only ever appends
    // libraries to an already-existing profile.
    if (profileName === DEFAULT_ENV_NAME) {
        return { content, changed: false };
    }

    const eol = detectEol(content);
    const lines = content.split(/\r?\n/);

    const range = findLibrariesRange(lines, profileName);
    if (!range) return { content, changed: false };

    // Collect existing library identities
    const existing: string[] = [];
    if (range.libKeyIdx !== -1 && range.libStart !== -1) {
        for (let i = range.libStart; i < range.libEnd; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('- ')) {
                existing.push(trimmed.slice(2).trim());
            }
        }
    }

    const seen = new Set(existing.map(sketchLibIdentity));
    const missing = deps.filter(lib => !seen.has(sketchLibIdentity(lib)));
    if (missing.length === 0) return { content, changed: false };

    const indent = range.libKeyIdx !== -1 ? indentOf(lines[range.libKeyIdx]) + 2 : 6;
    const prefix = ' '.repeat(indent) + '- ';

    if (range.libKeyIdx === -1) {
        // No `libraries:` key yet — insert one after the profile header
        const insertIdx = findProfileEndForInsertion(lines, range.profileStart);
        const libIndent = ' '.repeat(4);
        const newLines = [
            `${libIndent}libraries:`,
            ...missing.map(lib => `${prefix}${lib}`),
        ];
        lines.splice(insertIdx, 0, ...newLines);
    } else if (range.libStart === range.libEnd) {
        // `libraries:` exists but is empty
        const newLines = missing.map(lib => `${prefix}${lib}`);
        lines.splice(range.libStart, 0, ...newLines);
    } else {
        // Append after existing items
        const newLines = missing.map(lib => `${prefix}${lib}`);
        lines.splice(range.libEnd, 0, ...newLines);
    }

    return { content: lines.join(eol), changed: true };
}

function findProfileEndForInsertion(lines: string[], profileStart: number): number {
    for (let i = profileStart + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) return i;
        if (/^\s{2}\S/.test(lines[i]) && !lines[i].trim().startsWith('-')) return i;
    }
    return lines.length;
}