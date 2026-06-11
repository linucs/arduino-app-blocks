#!/usr/bin/env python3
"""
import-python-catalogs.py — repeatable transform (Guardrail G6).

Imports the Python L1/L2 block catalogs from the (retired) arduino-app-lab fork
into catalogs/arduino/python/*.yaml. The fork's builtin_*.yaml files declare BOTH
an arduino:cpp and an arduino:python implementation per entry; this script keeps
ONLY the arduino:python implementation (the C++ side is already covered by
catalogs/arduino/cpp/** copied from vscode-blockly).

Every transformation is a codified rule here — a block that fails schema
validation is fixed by a rule or reported, never by hand-patching the
webview/generator. Catalogs stay data.

Usage:
  tools/import-python-catalogs.py            # default source/dest paths
  tools/import-python-catalogs.py --check    # validate only, write nothing

Env:
  APP_LAB   path to the arduino-app-lab repo (default: ../arduino-app-lab)
"""
import os
import sys
import glob

try:
    import yaml
    import jsonschema
except ImportError:
    sys.exit("ERROR: needs pyyaml + jsonschema  (pip install pyyaml jsonschema)")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_LAB = os.environ.get("APP_LAB", os.path.join(ROOT, "..", "arduino-app-lab"))
SRC_DIR = os.path.join(
    APP_LAB, "standalone-apps", "app-lab-desktop", "internal", "blocks", "builtin"
)
DEST_DIR = os.path.join(ROOT, "catalogs", "arduino", "python")
SCHEMA = os.path.join(ROOT, "src", "catalog", "block-catalog_v1.schema.json")

PY_RUNTIME = "arduino:python"
SCHEMA_HEADER = (
    "# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/"
    "vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json\n"
    "# Imported from arduino-app-lab by tools/import-python-catalogs.py — do not hand-edit.\n"
)


# Fields the brick's webview does NOT register (built-in Blockly + webview/custom-fields/**
# are fine). A block referencing anything here can't render, so it's dropped.
# field_param_input + field_typed_param_input ARE supported (ported into the brick).
UNSUPPORTED_FIELDS: set[str] = set()

# Fork blocks superseded by the brick-authored code_* family (catalogs/arduino/
# python/code.yaml): the fork's custom_code/value_symbol become code_statement/
# code_expression there, so don't import the fork versions.
SUPERSEDED_TYPES = {"custom_code", "value_symbol"}


def block_supported(block):
    """Codified drop rules (logged by the caller):

    1. `generator:` — imperative first-party generators (e.g. the fork's
       section_* blocks) are not ported; the brick is codegen-only for catalogs.
    2. unsupported custom field — e.g. the fork's field_param_input (the brick
       uses field_typed_param_input instead).
    """
    bl = block.get("blockly", {})
    if bl.get("type") in SUPERSEDED_TYPES:
        return False, "superseded by code.yaml"
    if "generator" in block:
        return False, f"generator:{block['generator']}"
    for argset in ("args0", "args1", "args2"):
        for arg in bl.get(argset, []) or []:
            if isinstance(arg, dict) and arg.get("type") in UNSUPPORTED_FIELDS:
                return False, arg["type"]
    return True, None


def transform(entry):
    """Keep only the arduino:python implementation, minus unsupported blocks.
    Returns (entry|None, [dropped]) where dropped is a list of (type, reason)."""
    dropped = []
    impls = []
    for impl in entry.get("implementations", []):
        if impl.get("runtime") != PY_RUNTIME:
            continue
        kept = []
        for b in impl.get("blocks", []):
            ok, reason = block_supported(b)
            if ok:
                kept.append(b)
            else:
                dropped.append((b.get("blockly", {}).get("type", "?"), reason))
        if kept:
            impls.append({**impl, "blocks": kept})
    if not impls:
        return None, dropped
    out = {k: v for k, v in entry.items() if k != "implementations"}
    out["implementations"] = impls
    return out, dropped


def main():
    import json
    check_only = "--check" in sys.argv

    with open(SCHEMA) as f:
        schema = json.load(f)
    validator = jsonschema.Draft7Validator(schema)

    src_files = sorted(glob.glob(os.path.join(SRC_DIR, "*.yaml")))
    if not src_files:
        sys.exit(f"ERROR: no source catalogs under {SRC_DIR} (set APP_LAB=...)")

    if not check_only:
        os.makedirs(DEST_DIR, exist_ok=True)
        # Clear prior output (only our generated builtin_*.yaml), so a now-empty
        # entry can't leave a stale file. Brick-authored catalogs (e.g. code.yaml)
        # in the same dir are preserved.
        for stale in glob.glob(os.path.join(DEST_DIR, "builtin_*.yaml")):
            os.remove(stale)

    written, skipped, errors = 0, 0, 0
    for src in src_files:
        for entry in yaml.safe_load_all(open(src)):
            if not entry or "implementations" not in entry:
                continue
            out, dropped = transform(entry)
            for t, reason in dropped:
                print(f"drop {t}  ({reason})", file=sys.stderr)
            if out is None:
                if dropped:
                    skipped += 1
                continue
            errs = sorted(validator.iter_errors(out), key=lambda e: e.path)
            if errs:
                errors += 1
                print(f"ERR {entry.get('id')}: {errs[0].message}", file=sys.stderr)
                continue
            dest = os.path.join(DEST_DIR, f"{out['id']}.yaml")
            if check_only:
                print(f"ok   {out['id']}  ({len(out['implementations'][0]['blocks'])} blocks)")
            else:
                with open(dest, "w") as f:
                    f.write(SCHEMA_HEADER)
                    yaml.safe_dump(out, f, sort_keys=False, allow_unicode=True, width=120)
                print(f"wrote {os.path.relpath(dest, ROOT)}  ({len(out['implementations'][0]['blocks'])} blocks)")
            written += 1

    print(f"\n{written} catalog(s), {errors} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
