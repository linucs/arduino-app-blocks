import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { CatalogEntry } from '../src/catalog/CatalogTypes';
import schema from '../src/catalog/block-catalog_v1.schema.json';

/**
 * Server-side catalog loader: AJV compile/validate + recursive YAML directory
 * scan. Invalid entries are warned and skipped, not fatal.
 */
export class CatalogManager extends EventEmitter {
  private entries: CatalogEntry[] = [];
  private ajv: Ajv;
  private validate!: ReturnType<Ajv['compile']>;

  /**
   * @param builtinDir absolute path to the bundled catalogs dir (the first-party
   *                   L1/L2 blocks, e.g. <root>/catalogs/arduino).
   */
  constructor(private readonly builtinDir: string) {
    super();
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async init(): Promise<void> {
    this.validate = this.ajv.compile(schema);
    await this.reloadCatalogs();
  }

  async reloadCatalogs(): Promise<void> {
    this.entries = [];
    await this.collectEntriesFromDirectory(this.builtinDir, this.entries);
    console.log(`[CatalogManager] Loaded ${this.entries.length} block catalog entries.`);
    this.emit('change');
  }

  getEntries(): CatalogEntry[] {
    return this.entries;
  }

  /**
   * Validate a single parsed catalog document against block-catalog_v1, reusing
   * the same compiled AJV the loader uses (one validator, no second copy). Returns
   * the list of human-readable errors; empty means valid.
   */
  validateEntry(doc: unknown): string[] {
    if (!doc || typeof doc !== 'object') return ['not an object'];
    if (this.validate(doc)) return [];
    return [this.ajv.errorsText(this.validate.errors)];
  }

  /** Load+validate entries from a directory without mutating the global list. */
  async loadEntriesFrom(dirPath: string): Promise<CatalogEntry[]> {
    const entries: CatalogEntry[] = [];
    await this.collectEntriesFromDirectory(dirPath, entries);
    return entries;
  }

  private async collectEntriesFromDirectory(dirPath: string, out: CatalogEntry[]): Promise<void> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) return;

      const files = await fs.readdir(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await this.collectEntriesFromFile(fullPath, out);
        } else {
          const fileStat = await fs.stat(fullPath);
          if (fileStat.isDirectory()) {
            await this.collectEntriesFromDirectory(fullPath, out);
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[CatalogManager] Error reading directory ${dirPath}:`, error);
      }
    }
  }

  private async collectEntriesFromFile(filePath: string, out: CatalogEntry[]): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const documents = yaml.loadAll(content);
      for (const doc of documents) {
        if (!doc || typeof doc !== 'object') continue;
        if (this.validate(doc)) {
          out.push(doc as CatalogEntry);
        } else {
          console.warn(
            `[CatalogManager] Validation failed for entry in ${filePath}:`,
            this.ajv.errorsText(this.validate.errors)
          );
        }
      }
    } catch (error) {
      console.error(`[CatalogManager] Failed to load catalog file ${filePath}:`, error);
    }
  }
}
