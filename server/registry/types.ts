export interface RegistryIndex {
    version: number;
    generated: string;
    entries: RegistryEntry[];
}

export interface RegistryEntry {
    id: string;
    category: string;
    description?: string | Record<string, string>;
    author?: string;
    version?: string;
    runtimes: string[];
    targets: string[];
    blockCount: number;
    path: string;
    downloadUrl: string;
}