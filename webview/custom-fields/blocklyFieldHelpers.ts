import * as Blockly from 'blockly';

const MINUS_SVG =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBkPSJNMTggMTFoLTEyYy0xLjEwNCAwLTIgLjg5Ni0yIDJzLjg5NiAyIDIgMmgxMmMxLjEwNCAwIDItLjg5NiAyLTJzLS44OTYtMi0yLTJ6IiBmaWxsPSJ3aGl0ZSIgLz48L3N2Zz4K';
const PLUS_SVG =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48cGF0aCBkPSJNMTggMTBoLTR2LTRjMC0xLjEwNC0uODk2LTItMi0ycy0yIC44OTYtMiAybC4wNzEgNGgtNC4wNzFjLTEuMTA0IDAtMiAuODk2LTIgMnMuODk2IDIgMiAybDQuMDcxLS4wNzEtLjA3MSA0LjA3MWMwIDEuMTA0Ljg5NiAyIDIgMnMyLS44OTYgMi0ydi00LjA3MWw0IC4wNzFjMS4xMDQgMCAyLS44OTYgMi0ycy0uODk2LTItMi0yeiIgZmlsbD0id2hpdGUiIC8+PC9zdmc+Cg==';

function getMutationState(block: Blockly.Block): string {
    const b = block as unknown as {
        saveExtraState?(): object | null;
        mutationToDom?(): Element | null;
    };
    if (b.saveExtraState) {
        const state = b.saveExtraState();
        return state ? JSON.stringify(state) : '';
    }
    if (b.mutationToDom) {
        const xml = b.mutationToDom();
        return xml ? Blockly.Xml.domToText(xml) : '';
    }
    return '';
}

export function createPlusField(): Blockly.FieldImage {
    return new Blockly.FieldImage(PLUS_SVG, 15, 15, undefined, (field) => {
        const block = field.getSourceBlock();
        if (!block || block.isInFlyout) return;
        Blockly.Events.setGroup(true);
        const before = getMutationState(block);
        (block as unknown as { plus(): void }).plus();
        const after = getMutationState(block);
        if (before !== after) {
            Blockly.Events.fire(
                new Blockly.Events.BlockChange(block, 'mutation', null, before, after),
            );
        }
        Blockly.Events.setGroup(false);
    });
}

export function createMinusField(): Blockly.FieldImage {
    return new Blockly.FieldImage(MINUS_SVG, 15, 15, undefined, (field) => {
        const block = field.getSourceBlock();
        if (!block || block.isInFlyout) return;
        Blockly.Events.setGroup(true);
        const before = getMutationState(block);
        (block as unknown as { minus(): void }).minus();
        const after = getMutationState(block);
        if (before !== after) {
            Blockly.Events.fire(
                new Blockly.Events.BlockChange(block, 'mutation', null, before, after),
            );
        }
        Blockly.Events.setGroup(false);
    });
}