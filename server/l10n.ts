import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Host-side l10n bundle loading. The bundles ship next to the server under
 * `l10n/` and are injected into the webview HTML as JSON <script> tags at boot.
 */
async function readJsonBundle(baseDir: string, relativePath: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(baseDir, relativePath), 'utf-8');
    JSON.parse(raw); // validate
    return raw;
  } catch {
    return '{}';
  }
}

export interface L10nData {
  locale: string;
  bundle: string; // host UI strings (@vscode/l10n contents)
  blockMessages: { en: string; locale: string };
}

export async function loadL10n(baseDir: string, locale: string): Promise<L10nData> {
  const bundle = !locale || locale === 'en'
    ? '{}'
    : await readJsonBundle(baseDir, `l10n/bundle.l10n.${locale}.json`);
  const en = await readJsonBundle(baseDir, 'l10n/blocks.en.json');
  const localeBundle = locale && locale !== 'en'
    ? await readJsonBundle(baseDir, `l10n/blocks.${locale}.json`)
    : '{}';
  return { locale: locale || 'en', bundle, blockMessages: { en, locale: localeBundle } };
}
