/**
 * Collect every block type used in a Blockly workspace serialization, walking
 * into value/statement inputs, shadows, and `next` chains. Used to determine
 * which catalog implementations (and thus dependencies) the sketch references.
 */
export function collectUsedBlockTypes(state: unknown): string[] {
    const types = new Set<string>();

    const visit = (block: any): void => {
        if (!block || typeof block !== 'object') return;
        if (typeof block.type === 'string') types.add(block.type);
        if (block.inputs && typeof block.inputs === 'object') {
            for (const input of Object.values<any>(block.inputs)) {
                visit(input?.block);
                visit(input?.shadow);
            }
        }
        if (block.next && typeof block.next === 'object') visit(block.next.block);
    };

    const top = (state as any)?.blocks?.blocks;
    if (Array.isArray(top)) top.forEach(visit);
    return [...types];
}