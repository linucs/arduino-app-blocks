import * as Blockly from 'blockly';

type Preset = [string, string];

const SEP = '|';

export class FieldTypedParamInput extends Blockly.Field<string> {
    override SERIALIZABLE = true;
    override EDITABLE = true;

    private presets_: Preset[];
    private varId_: string | null = null;

    constructor(
        presets: Preset[],
        initial?: string,
        validator?: Blockly.FieldValidator<string>,
    ) {
        super(initial ?? '', validator);
        this.presets_ = presets;
    }

    static override fromJson(options: Record<string, unknown>): FieldTypedParamInput {
        const presets = (options['options'] as Preset[]) ?? [];
        const defaultName = (options['text'] as string | undefined) ?? 'param';
        const defaultType =
            (options['defaultType'] as string | undefined) ??
            presets[0]?.[1] ??
            'int';
        return new FieldTypedParamInput(presets, `${defaultType}${SEP}${defaultName}`);
    }

    protected override doClassValidation_(value?: string): string | null {
        if (!value) return '';
        return String(value);
    }

    getParamType(): string {
        const raw = this.getValue() || '';
        const idx = raw.indexOf(SEP);
        return idx < 0 ? raw : raw.slice(0, idx);
    }

    getParamName(): string {
        const raw = this.getValue() || '';
        const idx = raw.indexOf(SEP);
        return idx < 0 ? '' : raw.slice(idx + 1);
    }

    getVarId(): string | null {
        return this.varId_;
    }

    protected override getDisplayText_(): string {
        return `${this.getParamType()} ${this.getParamName()} ▾`;
    }

    override getText(): string {
        return `${this.getParamType()} ${this.getParamName()}`;
    }

    override initModel(): void {
        const block = this.getSourceBlock();
        if (!block || this.varId_) return;
        if ((block as Blockly.BlockSvg).isInFlyout) return;
        const name = this.getParamName() || 'param';
        const type = this.getParamType();
        const varMap = block.workspace.getVariableMap();
        const existing = varMap.getVariable(name, type);
        this.varId_ = existing
            ? existing.getId()
            : varMap.createVariable(name, type).getId();
    }

    override dispose(): void {
        this.deleteVar_();
        super.dispose();
    }

    protected override doValueUpdate_(newValue: string): void {
        super.doValueUpdate_(newValue);
        if (!this.varId_) return;
        const block = this.getSourceBlock();
        if (!block) return;
        const varMap = block.workspace.getVariableMap();
        const v = varMap.getVariableById(this.varId_);
        if (!v) return;

        const newName = this.parseName_(newValue) || 'param';
        const newType = this.parseType_(newValue);

        if (v.getName() !== newName) {
            varMap.renameVariable(v, newName);
        }
        if (v.getType() !== newType) {
            this.migrateVariableType_(block.workspace, this.varId_, newName, newType);
        }
    }

    private parseType_(value: string): string {
        const idx = (value || '').indexOf(SEP);
        return idx < 0 ? (value || '') : value.slice(0, idx);
    }

    private parseName_(value: string): string {
        const idx = (value || '').indexOf(SEP);
        return idx < 0 ? '' : value.slice(idx + 1);
    }

    private migrateVariableType_(
        workspace: Blockly.Workspace,
        oldVarId: string,
        name: string,
        newType: string,
    ): void {
        const varMap = workspace.getVariableMap();
        const oldVar = varMap.getVariableById(oldVarId);
        if (!oldVar) return;

        const uses = Blockly.Variables.getVariableUsesById(workspace, oldVarId);
        const newVar = varMap.createVariable(name, newType);

        for (const useBlock of uses) {
            for (const input of useBlock.inputList) {
                for (const field of input.fieldRow) {
                    if (
                        field instanceof Blockly.FieldVariable &&
                        field.getValue() === oldVarId
                    ) {
                        field.setValue(newVar.getId());
                    }
                }
            }
        }

        if (Blockly.Variables.getVariableUsesById(workspace, oldVarId).length === 0) {
            varMap.deleteVariable(oldVar);
        }

        this.varId_ = newVar.getId();
    }

    private deleteVar_(): void {
        if (!this.varId_) return;
        const block = this.getSourceBlock();
        if (!block) return;
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
                        field instanceof FieldTypedParamInput &&
                        field.getVarId() === this.varId_
                    ) {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    protected override showEditor_(): void {
        const contentDiv = Blockly.DropDownDiv.getContentDiv();
        contentDiv.innerHTML = '';
        contentDiv.style.maxWidth = '280px';

        const currentType = this.getParamType();
        const currentName = this.getParamName();
        let pendingType = currentType;

        const commit = (): void => {
            const typedName = (nameInput.value || '').trim() || 'param';
            const finalType =
                (pendingType || customInput.value.trim() || currentType).trim() || currentType;
            this.setValue(`${finalType}${SEP}${typedName}`);
            Blockly.DropDownDiv.hideIfOwner(this);
        };

        // Name row
        const nameRow = document.createElement('div');
        nameRow.className = 'blocklyComboboxInputRow';
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '6px';

        const nameLabel = document.createElement('span');
        nameLabel.textContent = Blockly.Msg['FIELD_PARAM_NAME'] ?? 'name';
        nameLabel.className = 'blocklyTypedParamLabel';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = currentName;
        nameInput.placeholder = 'paramName';
        nameInput.className = 'blocklyComboboxInput';
        nameInput.style.flex = '1';
        nameRow.appendChild(nameLabel);
        nameRow.appendChild(nameInput);

        // Separator
        const sep = document.createElement('div');
        sep.className = 'blocklyComboboxSeparator';

        // Type list
        const typeList = document.createElement('div');
        typeList.style.maxHeight = '240px';
        typeList.style.overflowY = 'auto';

        const typeHeader = document.createElement('div');
        typeHeader.textContent = Blockly.Msg['FIELD_PARAM_TYPE'] ?? 'type';
        typeHeader.className = 'blocklyTypedParamLabel';
        typeHeader.style.padding = '4px 12px 2px';
        typeHeader.style.textTransform = 'uppercase';
        typeHeader.style.letterSpacing = '0.5px';
        typeList.appendChild(typeHeader);

        for (const [label, value] of this.presets_) {
            const opt = document.createElement('div');
            opt.className = 'blocklyComboboxItem';
            if (value === pendingType) opt.classList.add('blocklyComboboxItemSelected');
            opt.textContent = label;
            opt.addEventListener('click', () => {
                pendingType = value;
                commit();
            });
            typeList.appendChild(opt);
        }

        // Custom type separator + input
        const customSep = document.createElement('div');
        customSep.className = 'blocklyComboboxSeparator';
        typeList.appendChild(customSep);

        const customRow = document.createElement('div');
        customRow.className = 'blocklyComboboxInputRow';
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.placeholder = 'Custom type…';
        customInput.className = 'blocklyComboboxInput';
        const isPreset = this.presets_.some(([, v]) => v === currentType);
        if (!isPreset && currentType) customInput.value = currentType;
        customRow.appendChild(customInput);
        typeList.appendChild(customRow);

        customInput.addEventListener('keydown', (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                pendingType = customInput.value.trim() || pendingType;
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                Blockly.DropDownDiv.hideIfOwner(this);
            }
        });

        nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                Blockly.DropDownDiv.hideIfOwner(this);
            }
        });

        contentDiv.appendChild(nameRow);
        contentDiv.appendChild(sep);
        contentDiv.appendChild(typeList);

        const block = this.getSourceBlock();
        if (block instanceof Blockly.BlockSvg) {
            Blockly.DropDownDiv.setColour(
                block.style.colourPrimary,
                block.style.colourTertiary,
            );
        }

        Blockly.DropDownDiv.showPositionedByField(this, () => {
            contentDiv.innerHTML = '';
        });

        nameInput.focus();
        nameInput.select();
    }
}

Blockly.fieldRegistry.register('field_typed_param_input', FieldTypedParamInput);