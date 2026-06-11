import * as Blockly from 'blockly';

const MAX_DISPLAY_LENGTH = 30;

let activeFieldCode: FieldCode | null = null;

/**
 * A code-editing field that shows a truncated preview on the block
 * and opens a modal with a monospace textarea when clicked.
 *
 * Registered as `field_code` in the Blockly field registry.
 */
export class FieldCode extends Blockly.Field<string> {
    override SERIALIZABLE = true;
    override EDITABLE = true;

    private modalEl_: HTMLDivElement | null = null;
    private textarea_: HTMLTextAreaElement | null = null;

    constructor(value?: string, validator?: Blockly.FieldValidator<string>) {
        super(value || '', validator);
    }

    static override fromJson(options: Record<string, unknown>): FieldCode {
        return new FieldCode(options['text'] as string | undefined);
    }

    protected override doClassValidation_(value?: string): string | null {
        if (value === undefined || value === null) return '';
        return String(value);
    }

    protected override getDisplayText_(): string {
        const val = this.getValue();
        if (!val) return '✎ click to edit';
        const lines = val.split('\n');
        const first =
            lines[0].length > MAX_DISPLAY_LENGTH
                ? lines[0].slice(0, MAX_DISPLAY_LENGTH) + '…'
                : lines[0];
        if (lines.length > 1) return `${first}  (+${lines.length - 1} lines)`;
        return first;
    }

    protected override showEditor_(): void {
        if (activeFieldCode) return;
        activeFieldCode = this;
        this.createModal_();
    }

    private createModal_(): void {
        const styles = getComputedStyle(document.body);
        const bg = styles.getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
        const fg = styles.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4';
        const widgetBg = styles.getPropertyValue('--vscode-editorWidget-background').trim() || '#252526';
        const widgetBorder = styles.getPropertyValue('--vscode-editorWidget-border').trim() || '#454545';
        const selectionBg = styles.getPropertyValue('--vscode-editor-selectionBackground').trim() || '#264f78';
        const font = styles.getPropertyValue('--vscode-editor-fontFamily').trim() || '"Courier New", monospace';
        const fontSize = styles.getPropertyValue('--vscode-editor-fontSize').trim() || '13px';

        // Backdrop
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '100000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
        });

        const backdrop = document.createElement('div');
        Object.assign(backdrop.style, { position: 'absolute', inset: '0' });
        backdrop.addEventListener('click', () => this.closeModal_());

        // Dialog
        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            position: 'relative',
            backgroundColor: widgetBg,
            border: `1px solid ${widgetBorder}`,
            borderRadius: '6px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            width: '500px',
            maxWidth: '90vw',
            maxHeight: '70vh',
            color: fg,
            fontFamily: font,
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: `1px solid ${widgetBorder}`,
        });

        const title = document.createElement('span');
        title.textContent = Blockly.Msg['FIELD_CODE_TITLE'] ?? 'Custom Code';
        Object.assign(title.style, {
            fontSize: '13px',
            fontWeight: '600',
        });

        const doneBtn = document.createElement('button');
        doneBtn.textContent = Blockly.Msg['FIELD_CODE_DONE'] ?? 'Done';
        Object.assign(doneBtn.style, {
            padding: '4px 14px',
            fontSize: '12px',
            borderRadius: '3px',
            border: 'none',
            backgroundColor: selectionBg,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
        });
        doneBtn.addEventListener('click', () => this.closeModal_());

        header.appendChild(title);
        header.appendChild(doneBtn);

        // Textarea
        const textarea = document.createElement('textarea');
        textarea.value = this.getValue() || '';
        textarea.spellcheck = false;
        Object.assign(textarea.style, {
            flex: '1',
            margin: '0',
            padding: '12px 14px',
            border: 'none',
            outline: 'none',
            resize: 'none',
            backgroundColor: bg,
            color: fg,
            fontFamily: font,
            fontSize: fontSize,
            lineHeight: '1.5',
            tabSize: '2',
            minHeight: '200px',
            borderBottomLeftRadius: '6px',
            borderBottomRightRadius: '6px',
        });

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            // Tab inserts spaces instead of moving focus
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            }
            // Escape closes
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeModal_();
            }
            // Prevent Blockly from handling keys
            e.stopPropagation();
        });

        this.textarea_ = textarea;

        dialog.appendChild(header);
        dialog.appendChild(textarea);
        modal.appendChild(backdrop);
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        this.modalEl_ = modal;

        textarea.focus();
    }

    private closeModal_(): void {
        if (this.textarea_) {
            this.setValue(this.textarea_.value);
            this.textarea_ = null;
        }
        if (this.modalEl_) {
            this.modalEl_.remove();
            this.modalEl_ = null;
        }
        activeFieldCode = null;
    }

    override dispose(): void {
        if (activeFieldCode === this) {
            this.closeModal_();
        }
        super.dispose();
    }
}

Blockly.fieldRegistry.register('field_code', FieldCode);