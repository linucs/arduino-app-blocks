import * as Blockly from 'blockly';

/**
 * A text-input field that owns a workspace variable for the typed name.
 * Ported from arduino-app-lab (custom-fields/FieldParamInput.ts).
 *
 * Used for function/callback parameter name slots (e.g. Bridge.provide handlers
 * and other hat-style Python blocks). Unlike FieldVariable (a dropdown picker),
 * this looks and behaves like a plain text input — the user types a name,
 * introducing a new local parameter; internally it creates a matching workspace
 * variable so variables_get_dynamic blocks can reference the parameter inside
 * the body.
 *
 * This is the UNTYPED sibling of FieldTypedParamInput (which carries a C++ type);
 * Python parameters have no type, so this field omits it.
 *
 * Lifecycle:
 *   initModel()      — creates or reuses the workspace variable
 *   doValueUpdate_() — renames the variable when the user edits the field
 *   dispose()        — deletes the variable if nothing else references it
 */
export class FieldParamInput extends Blockly.FieldTextInput {
  private varId_: string | null = null;

  constructor(defaultName = 'param') {
    super(defaultName);
  }

  static override fromJson(options: Record<string, unknown>): FieldParamInput {
    return new FieldParamInput((options['text'] as string | undefined) ?? 'param');
  }

  // Called by Field.init() after the field is attached to its block.
  // Creates the workspace variable (or reuses one with the same name).
  override initModel(): void {
    const block = this.getSourceBlock();
    if (!block || this.varId_) return;
    // Flyout blocks are previews — skip variable creation so every category
    // click doesn't accumulate VarCreate events and grow the variable map.
    if ((block as Blockly.BlockSvg).isInFlyout) return;
    const name = this.getValue() || 'param';
    const varMap = block.workspace.getVariableMap();
    const existing = varMap.getVariable(name, '');
    this.varId_ = existing
      ? existing.getId()
      : varMap.createVariable(name, '').getId();
  }

  override dispose(): void {
    this.deleteVar_();
    super.dispose();
  }

  // Called whenever the field value changes. Renames the workspace variable
  // so all references (variables_get_dynamic blocks) inside the body follow.
  protected override doValueUpdate_(newValue: string): void {
    super.doValueUpdate_(newValue);
    if (!this.varId_) return;
    const block = this.getSourceBlock();
    if (!block) return;
    const varMap = block.workspace.getVariableMap();
    const v = varMap.getVariableById(this.varId_);
    if (v && v.getName() !== newValue) {
      block.workspace.getVariableMap().renameVariable(v, newValue);
    }
  }

  // Returns the workspace variable ID, used by the template engine and
  // generators to resolve the sanitised variable name via getVariableName().
  getVarId(): string | null {
    return this.varId_;
  }

  private deleteVar_(): void {
    if (!this.varId_) return;
    const block = this.getSourceBlock();
    if (!block) return;

    // Don't delete if another FieldParamInput in the workspace shares this variable.
    if (this.countSiblingFieldRefs_(block.workspace) > 0) {
      this.varId_ = null;
      return;
    }

    const varMap = block.workspace.getVariableMap();
    const v = varMap.getVariableById(this.varId_);
    if (v && Blockly.Variables.getVariableUsesById(block.workspace, this.varId_).length === 0) {
      varMap.deleteVariable(v);
    }
    this.varId_ = null;
  }

  private countSiblingFieldRefs_(workspace: Blockly.Workspace): number {
    let count = 0;
    for (const block of workspace.getAllBlocks(false)) {
      for (const input of block.inputList) {
        for (const field of input.fieldRow) {
          if (
            field !== this &&
            field instanceof FieldParamInput &&
            field.getVarId() === this.varId_
          ) {
            count++;
          }
        }
      }
    }
    return count;
  }
}

Blockly.fieldRegistry.register('field_param_input', FieldParamInput);
