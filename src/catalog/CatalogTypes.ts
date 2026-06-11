export interface CatalogEntry {
    id: string;
    category: string;
    description?: string | Record<string, string>;
    colour?: string;
    author?: string;
    version?: string;
    docs?: Record<string, string>;
    implementations: Implementation[];
}

export interface Implementation {
    runtime: string;
    dependencies?: Dependency[];
    targets?: string[];
    codegen?: CodegenSections;
    blocks: BlockDefinition[];
}

export type Dependency = LibraryDependency | PipDependency | BrickDependency;

export interface LibraryDependency {
    type: 'library';
    name: string;
    minVersion?: string;
    /**
     * Git/VCS URL for libraries not in the PlatformIO registry (e.g. brand-new
     * board libraries like Arduino_Nesso_N1). When set, the dependency is
     * emitted as PlatformIO's `name=url` form and `minVersion` is ignored —
     * pin via `ref` instead. See .claude/docs/01-library-resolution.md.
     */
    url?: string;
    /** Optional git tag/branch/commit to pin the VCS dependency (e.g. `v1.0.0`). */
    ref?: string;
}

export interface PipDependency {
    type: 'pip';
    name: string;
    minVersion?: string;
}

export interface BrickDependency {
    type: 'brick';
    name: string;
    variables?: Record<string, string>;
}

export interface BlockDefinition {
    blockly: {
        type: string;
        [key: string]: any;
    };
    codegen?: BlockCodegen;
    generator?: string;
    tags?: string[];
}

export interface BlockCodegen extends CodegenSections {
    body?: string[];
    precedence?: CodegenPrecedence;
    inputDefaults?: Record<string, unknown>;
}

export interface CodegenSections {
    imports?: string[];
    declarations?: string[];
    setup?: string[];
    helpers?: Record<string, string>;
    cleanup?: string[];
}

export type CodegenPrecedence =
    | 'ATOMIC'
    | 'UNARY_PREFIX'
    | 'MULTIPLICATION'
    | 'ADDITION'
    | 'RELATIONAL'
    | 'EQUALITY'
    | 'LOGICAL_AND'
    | 'LOGICAL_OR'
    | 'NONE';