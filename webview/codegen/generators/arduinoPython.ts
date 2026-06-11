import * as Blockly from 'blockly';
import { PythonGenerator, pythonGenerator } from 'blockly/python';
import { FieldTypedParamInput } from '../../custom-fields/FieldTypedParamInput';
// Importing the field both binds it for the instanceof check below and triggers
// its self-registration (field_param_input). The hat_event_style extension is
// registered runtime-neutrally at editor boot in webview/index.ts.
import { FieldParamInput } from '../../custom-fields/FieldParamInput';
import { assembleScript } from './assembleScript';
import { RuntimeGenerator } from '../runtimeGenerator';

/**
 * arduino:python generation engine — ported from arduino-app-lab
 * (generators/ArduinoPythonGenerator.ts), adapted to the brick's RuntimeGenerator
 * interface and its FieldTypedParamInput field.
 *
 * Builds on Blockly's stock PythonGenerator for the primitive language blocks
 * (logic/loops/math/text/lists/variables/functions) and adds YAML-driven catalog
 * codegen on top via CodeFactory + templateEngine, exactly like arduinoCpp.ts.
 */
export const ARDUINO_PYTHON_RUNTIME = 'arduino:python';

// `App` is always emitted by finish() — reserve it so a user variable named
// "App" can't shadow the import.
const ARDUINO_RESERVED = ['App'];

class ArduinoPythonGenerator extends PythonGenerator {
  // Widened from protected — catalog codegen writes import_*/decl_*/setup_*
  // entries through this map (same contract as the cpp generator's definitions_).
  public declare definitions_: { [key: string]: string };
  private paramVarIds_: Set<string> = new Set();

  constructor() {
    super('ArduinoPython');
    this.addReservedWords(ARDUINO_RESERVED.join(','));
    // The built-in Python handlers are attached to the bundled singleton by
    // side-effect at module load, not in the constructor — a fresh subclass
    // starts with an empty forBlock. Copy the handler refs onto our per-instance
    // map without mutating the singleton.
    Object.assign(this.forBlock, pythonGenerator.forBlock);

    // match/case (Python 3.10+) for the shared controls_switch_case block.
    this.forBlock['controls_switch_case'] = (block, generator): string => {
      const INDENT = generator.INDENT;
      const PASS = (generator as unknown as { PASS: string }).PASS ?? 'pass';
      const expr = generator.valueToCode(block, 'SWITCH_EXPR', 0) || '0';
      const reindent = (code: string): string =>
        code.split('\n').map(l => (l ? INDENT + l : l)).join('\n');

      let code = `match ${expr}:\n`;
      for (let i = 0; block.getInput(`CASE_${i}_VAL`); i++) {
        const val = generator.valueToCode(block, `CASE_${i}_VAL`, 0) || '0';
        const body = generator.statementToCode(block, `CASE_${i}_BODY`) || `${INDENT}${PASS}\n`;
        code += `${INDENT}case ${val}:\n`;
        code += reindent(body);
      }
      const defaultBody = generator.statementToCode(block, 'DEFAULT_BODY');
      if (defaultBody) {
        code += `${INDENT}case _:\n`;
        code += reindent(defaultBody);
      }
      return code;
    };
  }

  // PythonGenerator.init() writes ALL workspace variables as "x = None" into
  // definitions_.variables — including procedure parameters, which must not
  // appear as module-level declarations (they're already in the signature).
  // Rebuild definitions_.variables after the parent runs, excluding params.
  override init(workspace: Blockly.Workspace): void {
    super.init(workspace);

    const paramVarIds = new Set<string>();
    for (const block of workspace.getAllBlocks(false)) {
      if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') {
        for (const v of block.getVarModels()) paramVarIds.add(v.getId());
      }
      for (const input of block.inputList) {
        for (const field of input.fieldRow) {
          // Python callback params use FieldParamInput (untyped); C++ procedure
          // rows use FieldTypedParamInput. Either contributes a parameter var
          // that must be excluded from module-level declarations.
          if (field instanceof FieldParamInput || field instanceof FieldTypedParamInput) {
            const varId = field.getVarId();
            if (varId) paramVarIds.add(varId);
          }
        }
      }
    }

    // Pre-register parameter variables in nameDB_ (populateVariables only sees
    // variables exposed via getVarModels()).
    for (const varId of paramVarIds) {
      this.getVariableName(varId);
    }

    this.paramVarIds_ = paramVarIds;
    if (paramVarIds.size === 0) return;

    const nonParamVars = Blockly.Variables.allUsedVarModels(workspace).filter(
      (v) => !paramVarIds.has(v.getId()),
    );

    if (nonParamVars.length === 0) {
      delete this.definitions_['variables'];
    } else {
      this.definitions_['variables'] = nonParamVars
        .map((v) => `${this.getVariableName(v.getId())} = None`)
        .join('\n');
    }
  }

  override finish(code: string): string {
    const paramVarNames = new Set<string>();
    for (const varId of this.paramVarIds_) {
      paramVarNames.add(this.getVariableName(varId));
    }

    const loopBody = code ? this.prefixLines(code.replace(/\n+$/, ''), this.INDENT) : '';
    const result = assembleScript(this.definitions_, loopBody, this.INDENT, this.PASS, paramVarNames);

    this.definitions_ = Object.create(null);
    this.paramVarIds_ = new Set();
    this.nameDB_?.reset();

    return result;
  }
}

export function createArduinoPythonGenerator(): RuntimeGenerator {
  const g = new ArduinoPythonGenerator();
  return {
    runtime: ARDUINO_PYTHON_RUNTIME,
    generator: g,
    generate: (workspace: Blockly.Workspace) => g.workspaceToCode(workspace),
  };
}
