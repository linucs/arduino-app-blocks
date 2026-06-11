import * as Blockly from 'blockly';

import { createMinusField, createPlusField } from '../custom-fields/blocklyFieldHelpers';
import { blockStyleFor } from '../ThemeAdapter';

const { Align } = Blockly.inputs;

interface SwitchCaseBlock extends Blockly.Block {
    caseCount_: number;
    plus(): void;
    minus(_idx: number): void;
    addCase_(): void;
    removeCase_(): void;
    updateMinus_(): void;
}

if (!Blockly.Blocks['controls_switch_case']) {
    Blockly.Blocks['controls_switch_case'] = {
        init(this: SwitchCaseBlock): void {
            this.caseCount_ = 0;

            this.appendValueInput('SWITCH_EXPR')
                .appendField(createPlusField())
                .appendField(Blockly.Msg['SWITCH_LABEL'] ?? 'switch')
                .setAlign(Align.RIGHT);

            this.appendDummyInput('DEFAULT_LABEL').appendField(Blockly.Msg['SWITCH_DEFAULT_LABEL'] ?? 'default');
            this.appendStatementInput('DEFAULT_BODY');

            this.setStyle(blockStyleFor('Logic'));
            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setTooltip(
                Blockly.Msg['SWITCH_TOOLTIP'] ?? 'Switch on an expression. Use [+] to add cases and [−] to remove them.',
            );

            this.addCase_();
        },

        plus(this: SwitchCaseBlock): void {
            this.addCase_();
        },

        minus(this: SwitchCaseBlock, _idx: number): void {
            if (this.caseCount_ <= 1) return;
            this.removeCase_();
        },

        addCase_(this: SwitchCaseBlock): void {
            const i = this.caseCount_++;
            this.appendValueInput(`CASE_${i}_VAL`)
                .appendField(Blockly.Msg['SWITCH_CASE_LABEL'] ?? 'case')
                .setAlign(Align.RIGHT);
            this.appendStatementInput(`CASE_${i}_BODY`).appendField(Blockly.Msg['SWITCH_DO_LABEL'] ?? 'do');
            this.moveInputBefore('DEFAULT_LABEL', null);
            this.moveInputBefore('DEFAULT_BODY', null);
            this.updateMinus_();
        },

        removeCase_(this: SwitchCaseBlock): void {
            this.caseCount_--;
            this.removeInput(`CASE_${this.caseCount_}_BODY`);
            this.removeInput(`CASE_${this.caseCount_}_VAL`);
            this.updateMinus_();
        },

        updateMinus_(this: SwitchCaseBlock): void {
            const header = this.getInput('SWITCH_EXPR')!;
            const hasMinus = Boolean(this.getField('MINUS'));
            if (!hasMinus && this.caseCount_ > 1) {
                header.insertFieldAt(1, createMinusField(), 'MINUS');
            } else if (hasMinus && this.caseCount_ <= 1) {
                (header as unknown as { removeField(n: string): void }).removeField('MINUS');
            }
        },

        saveExtraState(this: SwitchCaseBlock): object {
            return { caseCount: this.caseCount_ };
        },

        loadExtraState(
            this: SwitchCaseBlock,
            state: { caseCount: number },
        ): void {
            for (let i = 0; i < this.caseCount_; i++) {
                this.removeInput(`CASE_${i}_BODY`);
                this.removeInput(`CASE_${i}_VAL`);
            }
            this.caseCount_ = 0;
            if (this.getField('MINUS')) {
                const header = this.getInput('SWITCH_EXPR')!;
                (header as unknown as { removeField(n: string): void }).removeField('MINUS');
            }

            const count = state.caseCount ?? 1;
            for (let i = 0; i < count; i++) {
                this.addCase_();
            }
        },
    };
}