import * as Blockly from 'blockly';

const MSG_FIELD_RE = /^message\d+$/;
const TRANSLATABLE_FIELDS = new Set(['tooltip']);

function isI18nObject(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return 'en' in obj && typeof obj['en'] === 'string';
}

let keyCounter = 0;

function registerMsg(blockType: string, field: string, i18nObj: Record<string, string>, locale: string): string {
    const key = `CATALOG_${blockType.toUpperCase()}_${field.toUpperCase()}_${keyCounter++}`;
    const resolved = i18nObj[locale] ?? i18nObj['en'];
    Blockly.Msg[key] = resolved;
    return `%{BKY_${key}}`;
}

export function preprocessCatalogI18n(entries: any[], locale: string): any[] {
    for (const entry of entries) {
        if (!entry.implementations) continue;
        for (const impl of entry.implementations) {
            if (!impl.blocks) continue;
            for (const blockDef of impl.blocks) {
                if (!blockDef.blockly) continue;
                const bl = blockDef.blockly;
                const blockType: string = bl.type ?? 'unknown';

                for (const key of Object.keys(bl)) {
                    if (MSG_FIELD_RE.test(key) || TRANSLATABLE_FIELDS.has(key)) {
                        if (isI18nObject(bl[key])) {
                            bl[key] = registerMsg(blockType, key, bl[key], locale);
                        }
                    }
                }
            }
        }
    }
    return entries;
}