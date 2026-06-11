import * as Blockly from 'blockly';
import { registerCppLanguageBlocks, CPP_KEYWORDS } from '../cppLanguageBlocks';
import { FieldTypedParamInput } from '../../custom-fields/FieldTypedParamInput';
import { categorizeDefinitions, assembleSketch } from '../../../src/codegen/assembleSketch';
import { RuntimeGenerator } from '../runtimeGenerator';

export const ARDUINO_CPP_RUNTIME = 'arduino:cpp';

let paramVarIds: Set<string> = new Set();

export function createArduinoCppGenerator(): RuntimeGenerator {
    const g = new Blockly.CodeGenerator('arduino_cpp');
    g.INDENT = '  ';
    g.addReservedWords(CPP_KEYWORDS.join(','));

    const baseInit = (Blockly.CodeGenerator.prototype as any).init;

    (g as any).init = function (workspace: Blockly.Workspace) {
        if (typeof baseInit === 'function') baseInit.call(this, workspace);
        this.definitions_ = Object.create(null);
        this.definitions_['import_arduino_h'] = '#include <Arduino.h>';
        if (this.nameDB_) this.nameDB_.reset();
        else this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_ || '');
        this.nameDB_.setVariableMap(workspace.getVariableMap());
        this.nameDB_.populateVariables(workspace);
        this.nameDB_.populateProcedures(workspace);

        paramVarIds = new Set<string>();
        for (const block of workspace.getAllBlocks(false)) {
            if (
                block.type === 'procedures_defnoreturn' ||
                block.type === 'procedures_defreturn'
            ) {
                for (const v of block.getVarModels()) paramVarIds.add(v.getId());
            }
            for (const input of block.inputList) {
                for (const field of input.fieldRow) {
                    if (field instanceof FieldTypedParamInput) {
                        const varId = field.getVarId();
                        if (varId) paramVarIds.add(varId);
                    }
                }
            }
        }

        for (const varId of paramVarIds) {
            this.getVariableName(varId);
        }

        this.isInitialized = true;
    };

    (g as any).finish = function (code: string) {
        const sections = categorizeDefinitions(this.definitions_);
        this.isInitialized = false;
        if (this.nameDB_) this.nameDB_.reset();
        paramVarIds = new Set();
        return assembleSketch(sections, code);
    };

    (g as any).scrub_ = function (block: Blockly.Block, code: string, thisOnly?: boolean) {
        const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
        if (nextBlock && !thisOnly) {
            return code + this.blockToCode(nextBlock);
        }
        return code;
    };

    registerCppLanguageBlocks(g, paramVarIds);

    return {
        runtime: ARDUINO_CPP_RUNTIME,
        generator: g,
        generate: (workspace: Blockly.Workspace) => g.workspaceToCode(workspace),
    };
}