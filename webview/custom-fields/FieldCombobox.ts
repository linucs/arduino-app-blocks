import * as Blockly from 'blockly';

type Preset = [string, string];

export class FieldCombobox extends Blockly.Field<string> {
    override SERIALIZABLE = true;
    override EDITABLE = true;

    private presets_: Preset[];

    constructor(
        presets: Preset[],
        value?: string,
        validator?: Blockly.FieldValidator<string>,
    ) {
        super(value ?? presets[0]?.[1] ?? '', validator);
        this.presets_ = presets;
    }

    static override fromJson(options: Record<string, unknown>): FieldCombobox {
        const presets = (options['options'] as Preset[]) ?? [];
        const value = options['text'] as string | undefined;
        return new FieldCombobox(presets, value);
    }

    protected override doClassValidation_(value?: string): string | null {
        if (value === undefined || value === null) return '';
        return String(value);
    }

    protected override getDisplayText_(): string {
        const val = this.getValue();
        for (const [label, v] of this.presets_) {
            if (v === val) return `${label} ▾`;
        }
        return `${val || ''} ▾`;
    }

    override getText(): string {
        const val = this.getValue();
        for (const [label, v] of this.presets_) {
            if (v === val) return label;
        }
        return val || '';
    }

    protected override showEditor_(): void {
        const contentDiv = Blockly.DropDownDiv.getContentDiv();
        contentDiv.innerHTML = '';
        contentDiv.style.maxHeight = '300px';
        contentDiv.style.overflowY = 'auto';

        const currentValue = this.getValue();
        const isPreset = this.presets_.some(([, v]) => v === currentValue);

        for (const [label, value] of this.presets_) {
            const opt = document.createElement('div');
            opt.className = 'blocklyComboboxItem';
            if (value === currentValue) opt.classList.add('blocklyComboboxItemSelected');
            opt.textContent = label;
            opt.addEventListener('click', () => {
                this.setValue(value);
                Blockly.DropDownDiv.hideIfOwner(this);
            });
            contentDiv.appendChild(opt);
        }

        const sep = document.createElement('div');
        sep.className = 'blocklyComboboxSeparator';
        contentDiv.appendChild(sep);

        const inputRow = document.createElement('div');
        inputRow.className = 'blocklyComboboxInputRow';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Custom type…';
        input.className = 'blocklyComboboxInput';

        if (!isPreset && currentValue) {
            input.value = currentValue;
        }

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = input.value.trim();
                if (trimmed) this.setValue(trimmed);
                Blockly.DropDownDiv.hideIfOwner(this);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                Blockly.DropDownDiv.hideIfOwner(this);
            }
            e.stopPropagation();
        });

        inputRow.appendChild(input);
        contentDiv.appendChild(inputRow);

        Blockly.DropDownDiv.showPositionedByField(this, () => {
            contentDiv.innerHTML = '';
        });

        if (!isPreset) {
            input.focus();
            input.select();
        }
    }
}

Blockly.fieldRegistry.register('field_combobox', FieldCombobox);