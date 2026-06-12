/**
 * Community-catalog registry feature: fetch a remote block-catalog index, browse
 * it, and install entries into the app's .blocks/ dir.
 *
 *   registry.ts      headless model (fetch/cache/group/install)
 *   registryApi.ts   REST transport (/api/registry*)
 *   community.ts     the host-served browse page
 *   remoteCatalog.ts HTTP/fs fetch helpers
 *   types.ts         registry-index model
 */
export { Registry } from './registry';
export type { VendorGroup, InstalledEntry } from './registry';
export { handleRegistryApi } from './registryApi';
export { renderCommunityHtml } from './community';
