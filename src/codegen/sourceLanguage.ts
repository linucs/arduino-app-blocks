import * as path from 'path';

/**
 * Maps a source-file extension to its codegen language. The blocks editor opens
 * directly on a source file (via "Open With…"); that file's extension — not a
 * global mapping — decides the generation language and which catalog
 * implementations apply.
 *
 *   .cpp / .ino  -> cpp   (Arduino framework compiles C++; PlatformIO recommends .cpp)
 *   .py          -> python
 */
export const SOURCE_LANGUAGE_BY_EXT: Readonly<Record<string, string>> = {
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'cpp',
    '.ino': 'cpp',
    '.pde': 'cpp',
    '.py': 'python',
};

/** Companion file extension that stores the Blockly workspace for a source file. */
export const SIDECAR_EXT = '.blk';

export function languageForExtension(ext: string): string | undefined {
    return SOURCE_LANGUAGE_BY_EXT[ext.toLowerCase()];
}

export function languageForFile(fileName: string): string | undefined {
    return languageForExtension(path.extname(fileName));
}