import * as Blockly from 'blockly';

/**
 * `hat_event_style` block extension — ported from arduino-app-lab
 * (blocklyPlugins.ts). Renders the block with a rounded "hat" top, marking it
 * as a top-level event/callback handler (e.g. the Bridge.provide handler block).
 *
 * Registered as a side effect on import. Guarded so a re-import can't throw
 * "extension already registered".
 */
if (!Blockly.Extensions.isRegistered('hat_event_style')) {
  Blockly.Extensions.register('hat_event_style', function (this: Blockly.Block) {
    (this as unknown as { hat: string }).hat = 'cap';
  });
}
