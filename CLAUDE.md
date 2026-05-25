# CLAUDE.md — arduino-app-blocks

This repository hosts the **block catalog** for [Arduino App Lab](https://github.com/linucs/arduino-app-lab):
YAML files that describe hardware components, Python bricks, and AI patterns as Blockly
visual blocks. The App Lab binary loads these entries at runtime and adds them to the
block toolbox alongside the built-in Arduino blocks.

No local copy of `arduino-app-lab` is required to contribute here.

## Repository layout

```
catalogs/
  modulino/        ← Modulino component family (C++ + Python)
  detection/       ← AI detection bricks (Python)
  ai/              ← LLM / VLM bricks (Python)
  web-ui/          ← WebUI brick (Python)
  storage/         ← Time-series and SQL bricks (Python)
  speech/          ← ASR / TTS bricks (Python)
  cloud/           ← Arduino IoT Cloud brick (Python)
  <your-family>/   ← Add new families here
```

One YAML file per component family. Each file declares one catalog entry (`id`, `displayName`,
`category`, one or more `implementations`).

## Adding a new block

Use the **block-author** skill — it guides the full workflow: component research, block
design, YAML authoring, and schema validation.

Quick reference:

1. Create `catalogs/<family>/<component>.yaml`
2. Add the `# yaml-language-server` schema header (see skill)
3. Follow the schema at:
   `https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json`
4. Validate before submitting (see below)

## Validating catalog files

Run from the repo root. Requires `python3`, `pyyaml`, `jsonschema`:

```bash
pip install pyyaml jsonschema   # once

python3 - <<'EOF'
import yaml, json, jsonschema, urllib.request, glob, os, sys

SCHEMA_URL = (
    "https://raw.githubusercontent.com/linucs/arduino-app-lab/main"
    "/app/common/schemas/v1/block-catalog_v1.schema.json"
)
schema = json.loads(urllib.request.urlopen(SCHEMA_URL).read())

files = sys.argv[1:] or glob.glob("catalogs/**/*.yaml", recursive=True)
errors = []
for f in sorted(files):
    try:
        entry = yaml.safe_load(open(f))
        jsonschema.validate(entry, schema)
        print(f"OK  {os.path.basename(f)}")
    except jsonschema.ValidationError as e:
        errors.append(f)
        print(f"ERR {os.path.basename(f)}: {e.message}")
print(f"\n{len(files) - len(errors)}/{len(files)} valid")
EOF
```

## Conventions

- **One file per component family** — all blocks for a component (C++ + Python) in one file.
- **`id` is kebab-case** — e.g. `modulino-knob`, `grove-ultrasonic`.
- **`blockly.type` is snake_case** — e.g. `modulino_knob_value`. Never reuse or rename a type
  once it has shipped; renaming breaks saved workspaces.
- **Dropdown option values are quoted** — YAML 1.1 coerces `on`/`off`/`yes`/`no` to booleans.
  Always use `"on"`, `"off"`, etc.
- **No `generator:` field** — community entries must use `codegen` only. The imperative tier
  requires TypeScript registration inside the App Lab binary.
- **Colour hue** — block colors are optional: each block inherits its category primary color, unless specified. Stay consistent within a family. Modulino uses `20` (orange), detection uses `200` (teal), AI uses `270` (purple), WebUI `190` (cyan), Storage `60` (yellow), Speech `120` (green), Cloud `230` (blue).

## Testing

Smoke tests for compiled output live in the `arduino-app-lab` repository under
`smoke-tests/`. Opening a PR here will eventually trigger a CI job that validates
schema compliance; full smoke-test compilation is run on UNO Q hardware.
