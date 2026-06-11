import * as Blockly from 'blockly';

/**
 * A generation engine bound to a specific catalog `runtime` (`<framework>:<language>`).
 *
 * The engine is selected by runtime, NOT by language: two frameworks that share
 * a language (e.g. `arduino:cpp` vs `espidf:cpp`) emit structurally different
 * C++ (scaffolding, includes, idioms), so each runtime owns its own generator.
 */
export interface RuntimeGenerator {
    /** Canonical runtime key, e.g. `arduino:cpp`. */
    readonly runtime: string;
    /** The configured Blockly generator (init/finish/scrub_ + standard-block handlers). */
    readonly generator: Blockly.CodeGenerator;
    /** Produce the full source file for the given workspace. */
    generate(workspace: Blockly.Workspace): string;
}