const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const problemMatcher = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  // Browser-side Blockly UI bundle.
  // Runs against the acquireVsCodeApi() shim injected by the server before this loads.
  const webviewCtx = await esbuild.context({
    entryPoints: ['webview/index.ts'],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'silent',
    plugins: [problemMatcher],
  });

  // Node HTTP/WebSocket host — replaces the VS Code extension host.
  const serverCtx = await esbuild.context({
    entryPoints: ['server/index.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/server.js',
    loader: { '.css': 'text' },
    logLevel: 'silent',
    plugins: [problemMatcher],
  });

  if (watch) {
    await Promise.all([webviewCtx.watch(), serverCtx.watch()]);
  } else {
    await Promise.all([webviewCtx.rebuild(), serverCtx.rebuild()]);
    await Promise.all([webviewCtx.dispose(), serverCtx.dispose()]);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
