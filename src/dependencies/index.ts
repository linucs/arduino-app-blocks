/**
 * Dependency management: used blocks → required deps → add-only merge into the
 * matching project file, parameterized by dependency type.
 *
 *   collect.ts            collectors (blocks → deps), one per type
 *   sketchYamlMerge.ts    library → sketch.yaml lib_deps
 *   requirementsTxtMerge.ts  pip → requirements.txt
 *   appYamlMerge.ts       brick → app.yaml `bricks:`
 *
 * All pure. The host (server/session.ts) supplies the file IO around them.
 */
export {
  collectLibraryRequirements,
  collectPipRequirements,
  collectBrickRequirements,
} from './collect';
export type { ProjectRequirements, BrickRequirement } from './collect';
export { mergeSketchLibraries } from './sketchYamlMerge';
export { mergeRequirements } from './requirementsTxtMerge';
export { mergeAppBricks } from './appYamlMerge';
