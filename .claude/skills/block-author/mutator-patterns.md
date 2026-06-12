# Mutator Patterns Reference

> **For reference only.** Catalog entries in `arduino-app-blocks` must use the
> declarative `codegen` section — the `generator:` field that activates imperative
> codegen is only available to first-party blocks registered inside the App Lab
> binary. This document describes the imperative tier so that catalog authors
> understand what it does and why it exists.
>
> If you think your block genuinely requires imperative codegen, open an issue
> in the `arduino-app-lab` repository proposing it as a built-in block.

## When Do You Need a Mutator?

Most hardware blocks do NOT need mutators. Use the decision tree:

1. **Fixed inputs, chosen by dropdown** → Field validator, NOT mutator
   - Example: "read sensor in °C or °F" — dropdown changes the conversion but input count stays fixed
   - Use a `field_dropdown` and handle the logic in `codegen.body` or `codegen.helpers`

2. **Fixed inputs, always the same** → Static block definition, no mutator
   - Example: "set LED color R G B" — always 3 inputs

3. **Variable number of inputs at edit-time** → MUTATOR needed
   - Example: "create list with N items", "send values to N channels"
   - The user adds/removes inputs via the mutator UI
   - For catalog entries: express this with `@blockly/block-plus-minus` buttons and
     a declarative `codegen` that iterates over numbered inputs via `{{ITEM_N}}`
     placeholders — or open a first-party issue.

4. **Conditional inputs based on dropdown** → Field validator (preferred) or mutator
   - Example: "math operation" — division shows a divisor input, others don't
   - Prefer a multi-row block layout where the second row's input is always present

## Mutator Architecture (First-Party Reference)

A mutator requires TWO pieces registered BEFORE block instantiation:

### 1. Mutator Registration (Blockly)

```typescript
// File lives in the arduino-app-lab source tree, NOT in arduino-app-blocks.
Blockly.Extensions.registerMutator(
  'my_block_mutator',
  {
    saveExtraState(): object {
      return { itemCount: this.itemCount_ };
    },

    loadExtraState(state: { itemCount: number }): void {
      this.itemCount_ = state.itemCount;
      this.updateShape_();
    },

    decompose(workspace: Blockly.Workspace): Blockly.Block {
      const containerBlock = workspace.newBlock('my_block_container');
      containerBlock.initSvg();
      let connection = containerBlock.getInput('STACK')!.connection;
      for (let i = 0; i < this.itemCount_; i++) {
        const itemBlock = workspace.newBlock('my_block_item');
        itemBlock.initSvg();
        connection!.connect(itemBlock.previousConnection);
        connection = itemBlock.nextConnection;
      }
      return containerBlock;
    },

    compose(containerBlock: Blockly.Block): void {
      let itemBlock = containerBlock.getInputTargetBlock('STACK');
      const connections: Blockly.Connection[] = [];
      while (itemBlock) {
        connections.push(itemBlock.valueConnection_ as Blockly.Connection);
        itemBlock = itemBlock.nextConnection?.targetBlock() ?? null;
      }
      this.itemCount_ = connections.length;
      this.updateShape_();
      for (let i = 0; i < this.itemCount_; i++) {
        if (connections[i]) {
          this.getInput('ITEM' + i)?.connection?.connect(connections[i]);
        }
      }
    },

    updateShape_(): void {
      let i = 0;
      while (this.getInput('ITEM' + i)) {
        this.removeInput('ITEM' + i);
        i++;
      }
      for (let j = 0; j < this.itemCount_; j++) {
        this.appendValueInput('ITEM' + j)
          .setCheck(null)
          .appendField(j === 0 ? 'items' : '');
      }
    }
  },
  undefined,
  ['my_block_item']
);

Blockly.Blocks['my_block_container'] = {
  init() {
    this.appendStatementInput('STACK');
    this.setColour(230);
    this.contextMenu = false;
  }
};

Blockly.Blocks['my_block_item'] = {
  init() {
    this.appendDummyInput().appendField('item');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
    this.contextMenu = false;
  }
};
```

### 2. Generator Class (Imperative Tier — App Lab internal)

```typescript
// Implements IBlockCodeGenerator from the App Lab source tree.
// This interface is NOT available to community catalog entries.
export class MyBlockMutatorGenerator {
  generate(block: Blockly.Block, generator: Blockly.CodeGenerator): string | [string, number] {
    const count = (block as any).itemCount_ || 0;
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generator.valueToCode(block, 'ITEM' + i, 0);
      if (code) items.push(code);
    }
    // Value block: return [expression, Order.ATOMIC]
    return [`{${items.join(', ')}}`, 0];
    // Statement block: return `doSomething(${items.join(', ')});\n`;
  }
}
```

### 3. YAML Catalog Entry

```yaml
# This block type uses the imperative tier — only valid as a built-in block
# registered in the App Lab binary. Do NOT use generator: in arduino-app-blocks.
blockly:
  type: my_custom_list
  message0: "list with items"
  args0: []
  output: Array
  mutator: my_block_mutator
generator: MyBlockMutatorGenerator
```

## File Organization (First-Party Only)

For a built-in block that needs mutators, two files in the App Lab source tree:

```
standalone-apps/app-lab-desktop/frontend/src/
└── services/
    └── blockly/
        ├── custom-blocks/
        │   └── my-component.ts       ← mutator registration + Blockly.Blocks entries
        └── generators/
            └── my-component.gen.ts   ← generator class
```

The `.ts` files must be imported by the app before catalog entries are loaded (side-effect imports).
