import { FIRST_PARTY_GENERATORS, FirstPartyGenerator } from './firstPartyGenerators';

/**
 * Section-container first-party generators, registered at editor boot for BOTH
 * runtimes. These extend the shared FIRST_PARTY_GENERATORS map at runtime (it's a
 * plain object) so the copied firstPartyGenerators.ts stays byte-identical (G1).
 *
 * A section container is a "phantom" block: it emits nothing inline; instead it
 * captures its nested statements and routes them into a generation zone via the
 * generator's definitions_ map, keyed by the conventional prefix both the C++
 * (assembleSketch) and Python (assembleScript) assemblers understand:
 *
 *   code_includes    → import_*  (C++ #include zone / Python import zone)
 *   code_declaration → decl_*    (C++ global scope / Python module level)
 *   code_setup       → setup_*   (already shipped: C++ setup() / Python pre-loop)
 *
 * Same model as the existing code_setup generator — blockToCode (not
 * statementToCode) keeps children at column 0; the assembler indents each zone.
 */
function routeToZone(prefix: string): FirstPartyGenerator {
  return (block, generator) => {
    const target = block.getInputTargetBlock('MEMBERS');
    let members = target ? generator.blockToCode(target) : '';
    if (Array.isArray(members)) members = members[0];
    if (!(members as string).trim()) return '';
    (generator as unknown as { definitions_: Record<string, string> })
      .definitions_[`${prefix}custom_${block.id}`] = (members as string).replace(/\n$/, '');
    return '';
  };
}

// All three section containers go through the ONE factory, for both runtimes.
// (code_setup overrides the identical upstream codeSetup in firstPartyGenerators.ts
// so there is a single implementation; the only difference between the three is
// the target section prefix.)
FIRST_PARTY_GENERATORS.code_includes = routeToZone('import_');
FIRST_PARTY_GENERATORS.code_declaration = routeToZone('decl_');
FIRST_PARTY_GENERATORS.code_setup = routeToZone('setup_');
