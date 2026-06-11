import * as Blockly from 'blockly';

const ORDER_NONE = 99; // Blockly.javascript.ORDER_NONE or equivalent for our C++ generator

export function resolveTemplate(
  template: string,
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_match, raw: string) => {
    const [name, sub] = raw.split('.');
    const field = block.getField(name);
    if (field !== null) {
      if (field instanceof Blockly.FieldVariable) {
          const varId = block.getFieldValue(name) ?? '';
          return varId ? generator.getVariableName(varId) : '';
      }
      if (sub && 'getParamType' in field && 'getParamName' in field) {
        const typed = field as { getParamType(): string; getParamName(): string; getVarId(): string | null };
        if (sub === 'type') return typed.getParamType();
        if (sub === 'name') {
          const varId = typed.getVarId();
          return varId ? generator.getVariableName(varId) : typed.getParamName();
        }
      }
      return String(block.getFieldValue(name) ?? '');
    }

    const input = block.getInput(name);
    if (input !== null) {
      if (input.type === Blockly.inputs.inputTypes.VALUE) {
        return generator.valueToCode(block, name, ORDER_NONE) || '';
      }
      if (input.type === Blockly.inputs.inputTypes.STATEMENT) {
        return generator.statementToCode(block, name).replace(/\n$/, '');
      }
    }

    console.warn(`[templateEngine] unknown placeholder "{{${raw}}}" on block type "${block.type}"`);
    return '';
  });
}

function hashKey(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function applyCodegenSections(
  sections: any,
  generator: Blockly.CodeGenerator,
): void {
  const defs = (generator as any).definitions_;
  if (!defs) return;

  for (const line of sections.imports ?? []) {
    if (line) defs[`import_${hashKey(line)}`] = line;
  }
  for (const line of sections.declarations ?? []) {
    if (line) defs[`decl_${hashKey(line)}`] = line;
  }
  for (const line of sections.setup ?? []) {
    if (line) defs[`setup_${hashKey(line)}`] = line;
  }
  for (const [name, body] of Object.entries(sections.helpers ?? {})) {
    if (body) defs[`func_${name}`] = body as string;
  }
  for (const line of sections.cleanup ?? []) {
    if (line) defs[`cleanup_${hashKey(line)}`] = line;
  }
}

export function applyBlockCodegen(
  codegen: any,
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
  inputDefaults?: { [inputName: string]: unknown },
): string {
  const defaults = { ...(codegen.inputDefaults ?? {}), ...(inputDefaults ?? {}) };

  applyResolvedSections(codegen, block, generator, defaults);

  const bodyLines = codegen.body ?? [];
  const resolved = bodyLines
    .map((line: string) => resolveTemplateWithDefaults(line, block, generator, defaults))
    .join('\n');

  return resolved ? resolved + '\n' : '';
}

function applyResolvedSections(
  sections: any,
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
  defaults: { [name: string]: unknown },
): void {
  const defs = (generator as any).definitions_;
  if (!defs) return;

  for (const line of sections.imports ?? []) {
    const r = resolveTemplateWithDefaults(line, block, generator, defaults);
    if (r) defs[`import_${hashKey(r)}`] = r;
  }
  for (const line of sections.declarations ?? []) {
    const r = resolveTemplateWithDefaults(line, block, generator, defaults);
    if (r) defs[`decl_${hashKey(r)}`] = r;
  }
  for (const line of sections.setup ?? []) {
    const r = resolveTemplateWithDefaults(line, block, generator, defaults);
    if (r) defs[`setup_${hashKey(r)}`] = r;
  }
  for (const [name, body] of Object.entries(sections.helpers ?? {})) {
    const r = resolveTemplateWithDefaults(body as string, block, generator, defaults);
    if (r) defs[`func_${name}`] = r;
  }
  for (const line of sections.cleanup ?? []) {
    const r = resolveTemplateWithDefaults(line, block, generator, defaults);
    if (r) defs[`cleanup_${hashKey(r)}`] = r;
  }
}

function resolveTemplateWithDefaults(
  template: string,
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
  defaults: { [name: string]: unknown },
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_match, raw: string) => {
    const [name, sub] = raw.split('.');
    const field = block.getField(name);
    if (field !== null) {
      if (field instanceof Blockly.FieldVariable) {
          const varId = block.getFieldValue(name) ?? '';
          return varId ? generator.getVariableName(varId) : '';
      }
      if (sub && 'getParamType' in field && 'getParamName' in field) {
        const typed = field as { getParamType(): string; getParamName(): string; getVarId(): string | null };
        if (sub === 'type') return typed.getParamType();
        if (sub === 'name') {
          const varId = typed.getVarId();
          return varId ? generator.getVariableName(varId) : typed.getParamName();
        }
      }
      return String(block.getFieldValue(name) ?? '');
    }

    const input = block.getInput(name);
    if (input !== null) {
      if (input.type === Blockly.inputs.inputTypes.VALUE) {
        const code = generator.valueToCode(block, name, ORDER_NONE);
        if (code) return code;
        const fallback = defaults[name];
        return fallback !== undefined ? String(fallback) : '';
      }
      if (input.type === Blockly.inputs.inputTypes.STATEMENT) {
        return generator.statementToCode(block, name).replace(/\n$/, '');
      }
    }

    console.warn(`[templateEngine] unknown placeholder "{{${raw}}}" on block type "${block.type}"`);
    return '';
  });
}