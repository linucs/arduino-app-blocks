#!/usr/bin/env bash
#
# sync-core.sh — copy (or drift-check) the shared vscode-blockly core into this repo.
#
# G1 guardrail: the editor/codegen/catalog core is SHARED with vscode-blockly and
# is NOT hand-edited here. This script is the single source of truth for which
# files are copied and from which upstream commit. Any change to shared logic
# happens upstream in vscode-blockly, then flows down via `sync-core.sh --copy`.
#
# Usage:
#   tools/sync-core.sh --copy     # copy pinned upstream files into this repo
#   tools/sync-core.sh --check    # CI: fail if any copied file drifted from upstream
#
# Env:
#   VSCODE_BLOCKLY   path to the vscode-blockly git repo (default: ../vscode-blockly)
#
set -euo pipefail

# --- pinned upstream commit ------------------------------------------------
# Bump this SHA to intentionally pull newer shared code, then run --copy.
UPSTREAM_SHA="e85af2bdfb3a95cfddcebd656aa7954acf00ac46"

SRC="${VSCODE_BLOCKLY:-$(cd "$(dirname "$0")/../../vscode-blockly" 2>/dev/null && pwd || true)}"
DEST="$(cd "$(dirname "$0")/.." && pwd)"

# --- manifest: paths copied byte-identical from upstream -------------------
# Entries may be files or directories (directories are expanded recursively).
# Dest path mirrors the upstream path exactly.
MANIFEST=(
  # webview bundle (browser-side Blockly UI; runs against the acquireVsCodeApi shim)
  "webview"
  # pure catalog logic
  "src/catalog/boardFilter.ts"
  "src/catalog/requirements.ts"
  "src/catalog/remoteCatalog.ts"
  "src/catalog/CatalogTypes.ts"
  "src/catalog/CatalogRegistryTypes.ts"
  "src/catalog/block-catalog_v1.schema.json"
  # pure project parsing/merging (arduino path only — pio/** is intentionally excluded)
  "src/project/projectConfig.ts"
  "src/project/blockUsage.ts"
  "src/project/arduino/sketchYaml.ts"
  "src/project/arduino/sketchYamlMerge.ts"
  # pure codegen helpers (imported into the webview bundle; must stay vscode/Node-free)
  "src/codegen/assembleSketch.ts"
  "src/codegen/sourceLanguage.ts"
  # localization bundles
  "l10n"
  # built-in first-party C++ catalogs (the bundled toolbox content)
  "catalogs/arduino/cpp"
)

# --- brick-owned forks: derived from upstream but intentionally diverged -----
# These shared files had to gain multi-runtime (Python) support, which
# vscode-blockly does not implement. They are OWNED by the brick now: the sync
# neither overwrites them on --copy nor flags them on --check. New Python code
# lives in NEW files (webview/codegen/generators/arduinoPython.ts, etc.) that the
# manifest doesn't track, so only these two pre-existing files are forked.
EXCLUDE=(
  "webview/index.ts"
  "webview/codegen/generatorRegistry.ts"
  # Relabeled cpp_delay's display to "wait %1 ms" (still generates delay()) for
  # beginner C++/Python parallelism with python_wait. Codegen unchanged.
  "catalogs/arduino/cpp/time.yaml"
  # Added brick catalog category colours to BUILTIN_DEFAULTS so the same category
  # is coloured identically in C++ and Python (single source, no hex in catalogs).
  "webview/ThemeAdapter.ts"
  # code_setup moved from Control → Code so the whole code_* family lives in one
  # category, consistently with the Python side (catalogs/arduino/python/code.yaml).
  "catalogs/arduino/cpp/core.yaml"
  # Removed the imperative code_statement/code_expression/code_declaration defs +
  # handlers; the code_* family is now catalog-driven (catalogs/arduino/cpp/code.yaml)
  # through the single routeToZone() factory, mirroring Python.
  "webview/codegen/cppLanguageBlocks.ts"
)

is_excluded() {
  local f="$1"
  for e in "${EXCLUDE[@]}"; do [[ "$f" == "$e" ]] && return 0; done
  return 1
}

MODE="${1:---check}"

if [[ -z "${SRC}" || ! -d "${SRC}/.git" ]]; then
  echo "ERROR: vscode-blockly repo not found. Set VSCODE_BLOCKLY=/path/to/vscode-blockly" >&2
  exit 2
fi

# Resolve a manifest entry to the concrete list of upstream file paths at the pinned SHA.
list_files() {
  local entry="$1"
  git -C "${SRC}" ls-tree -r --name-only "${UPSTREAM_SHA}" -- "${entry}"
}

drift=0
copied=0

for entry in "${MANIFEST[@]}"; do
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if is_excluded "$f"; then continue; fi
    upstream_blob="$(git -C "${SRC}" show "${UPSTREAM_SHA}:${f}")"
    dest_file="${DEST}/${f}"
    if [[ "${MODE}" == "--copy" ]]; then
      mkdir -p "$(dirname "${dest_file}")"
      printf '%s' "${upstream_blob}" > "${dest_file}"
      copied=$((copied + 1))
    else
      if [[ ! -f "${dest_file}" ]] || ! diff -q <(printf '%s' "${upstream_blob}") "${dest_file}" >/dev/null; then
        echo "DRIFT: ${f}" >&2
        drift=$((drift + 1))
      fi
    fi
  done < <(list_files "${entry}")
done

if [[ "${MODE}" == "--copy" ]]; then
  echo "Copied ${copied} files from vscode-blockly@${UPSTREAM_SHA:0:10}"
elif [[ "${drift}" -gt 0 ]]; then
  echo "FAILED: ${drift} shared file(s) drifted from vscode-blockly@${UPSTREAM_SHA:0:10}." >&2
  echo "Shared core must not be hand-edited here. Edit upstream, then run tools/sync-core.sh --copy." >&2
  exit 1
else
  echo "OK: shared core matches vscode-blockly@${UPSTREAM_SHA:0:10}"
fi
