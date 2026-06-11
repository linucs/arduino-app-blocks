import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

function isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function filenameForUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const base = path.basename(parsed.pathname);
        if (base && /\.ya?ml$/i.test(base)) return base;
    } catch { /* ignore */ }
    // Fallback: hex-encode a short hash of the URL.
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    return `remote_${(hash >>> 0).toString(16)}.yaml`;
}

function httpGet(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'PlatformIO-Blocks-VSCode' } }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                httpGet(res.headers.location).then(resolve, reject);
                return;
            }
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

export interface DownloadResult {
    localPath: string;
    downloaded: boolean;
    error?: string;
}

/**
 * Download a remote YAML catalog to `destDir`, returning its local path.
 * Skips the download when the file already exists unless `force` is true.
 */
export async function downloadCatalog(
    url: string,
    destDir: string,
    force = false
): Promise<DownloadResult> {
    const filename = filenameForUrl(url);
    const localPath = path.join(destDir, filename);

    if (!force) {
        try {
            await fs.access(localPath);
            return { localPath, downloaded: false };
        } catch { /* file missing, proceed */ }
    }

    await fs.mkdir(destDir, { recursive: true });
    const data = await httpGet(url);
    await fs.writeFile(localPath, data);
    return { localPath, downloaded: true };
}

export { isUrl, httpGet };