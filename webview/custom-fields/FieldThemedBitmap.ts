import * as Blockly from 'blockly';
import { FieldBitmap } from '@blockly/field-bitmap';

function readThemeColours(): { empty: string; filled: string } {
    const styles = getComputedStyle(document.body);
    const empty = styles.getPropertyValue('--vscode-editorWidget-background').trim() || '#252526';
    const filled = styles.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4';
    return { empty, filled };
}

/**
 * FieldBitmap subclass that reads pixel colours from VS Code CSS variables
 * at render time so they always match the active theme.
 */
export class FieldThemedBitmap extends FieldBitmap {
    private applyThemeColours(): void {
        const colours = readThemeColours();
        this.pixelColours = colours;
    }

    override initView(): void {
        this.applyThemeColours();
        super.initView();
    }

    protected override showEditor_(): void {
        this.applyThemeColours();
        super.showEditor_();
    }

    static override fromJson(options: Record<string, unknown>): FieldThemedBitmap {
        return new FieldThemedBitmap(
            options['value'] as number[][] ?? Blockly.Field.SKIP_SETUP,
            undefined,
            options as any,
        );
    }
}

// Replace the default FieldBitmap registration (auto-registered by the import above).
try { Blockly.fieldRegistry.unregister('field_bitmap'); } catch { /* first run */ }
Blockly.fieldRegistry.register('field_bitmap', FieldThemedBitmap);