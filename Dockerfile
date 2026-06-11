# syntax=docker/dockerfile:1
#
# blocks-author brick image.
#
# Multi-stage: stage 1 builds dist/{server,webview}.js with esbuild; the runtime
# stage ships only the bundles + the data the server reads at runtime (catalogs/,
# l10n/). esbuild bundles all node deps into dist/server.js, so the runtime image
# needs no node_modules.

# ---- build ----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /src

COPY package.json package-lock.json* ./
# The multiselect Blockly plugin pins blockly <12 while we use 12.5.1 (upstream
# uses yarn, which is lenient) — mirror that with --legacy-peer-deps.
RUN npm install --legacy-peer-deps

COPY tsconfig.json esbuild.js ./
COPY webview ./webview
COPY src ./src
COPY server ./server
RUN node esbuild.js

# ---- runtime --------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /opt/blocks-author
ENV NODE_ENV=production

# Bundled server + browser bundle…
COPY --from=build /src/dist ./dist
# …and the data the server reads at runtime (RESOURCE_ROOT = this dir).
COPY catalogs ./catalogs
COPY l10n ./l10n

# Brick defaults (App Lab / compose can override).
ENV PORT=7100 \
    APP_HOME=/app \
    EDITABLE_EXTENSIONS=ino,cpp,py \
    GENERATE_MODE=auto \
    SHOW_MINIMAP=false \
    DEFAULT_FQBN=arduino:zephyr:unoq

EXPOSE 7100

HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
