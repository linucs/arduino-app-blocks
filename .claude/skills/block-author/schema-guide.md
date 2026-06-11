# Block Catalog v1 Schema Guide

Schema published at:
`https://raw.githubusercontent.com/linucs/arduino-app-blocks/refs/heads/main/src/catalog/block-catalog_v1.schema.json`

Catalog files are authored as **YAML**; the JSON Schema validates the parsed data model.
The `blockly` section inside each block is verbatim Blockly JSON (represented as a YAML
mapping — no special syntax needed).

Add this header to every catalog file for in-editor schema validation:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-blocks/refs/heads/main/src/catalog/block-catalog_v1.schema.json
```

## Catalog Entry (top level)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-blocks/refs/heads/main/src/catalog/block-catalog_v1.schema.json
id: modulino-thermo
category: Sensors
docs:
  datasheet: https://docs.arduino.cc/hardware/modulino-thermo
  library: https://www.arduino.cc/reference/en/libraries/modulino/
implementations:
  - ...
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Kebab-case for external catalog entries (e.g. `modulino-thermo`). |
| `category` | Yes | Toolbox category. Must match a predefined palette category (e.g. `Sensors`, `Vision`, `Audio`). Use `::` for subcategories (e.g. `I/O::Digital`, `Messaging::Serial`). |
| `docs` | No | URL map for documentation links (see [Documentation Links](#documentation-links)) |
| `implementations` | Yes | Array of runtime-specific implementations |

## Implementation

```yaml
runtime: arduino:cpp
dependencies:
  - type: library
    name: Modulino
    minVersion: "1.0.0"
codegen:
  imports:
    - "#include <Modulino.h>"
  declarations:
    - "ModulinoThermo _thermo;"
  setup:
    - "Modulino.begin();"
    - "_thermo.begin();"
blocks:
  - ...
```

| Field | Required | Description |
|-------|----------|-------------|
| `runtime` | Yes | `arduino:cpp` (→ sketch.ino) or `arduino:python` (→ main.py) |
| `dependencies` | No | Array of dependency objects (see below) |
| `codegen` | No | Implementation-level code sections (shared across all blocks) |
| `blocks` | Yes | Array of block definitions |

### Dependencies

Three types, discriminated by `type`:

```yaml
- type: library
  name: Modulino
  minVersion: "1.0.0"
```
→ Added to `sketch/sketch.yaml` → resolved by `arduino-cli`

```yaml
- type: pip
  name: numpy
  minVersion: "1.24.0"
```
→ Added to Python container requirements

```yaml
- type: brick
  name: arduino:web_ui
  variables:
    PORT: "8080"
```
→ Added to `app.yaml` → resolved by `arduino-app-cli`. `variables` is optional.

## Block Definition

```yaml
blockly:
  # Verbatim Blockly JSON block definition (as YAML mapping)
  type: modulino_thermo_temperature
  message0: "temperature °C"
  args0: []
  output: Number
  tooltip: Read temperature in Celsius.
  inputsInline: true
codegen:
  # code generation templates
  body:
    - "_thermo.getTemperature()"
  precedence: ATOMIC
tags:
  - sensor
  - input
  - i2c
  - beginner
```

| Field | Required | Description |
|-------|----------|-------------|
| `blockly` | Yes | Verbatim Blockly JSON — passed to `defineBlocksWithJsonArray()` unchanged |
| `codegen` | Yes* | Declarative-tier code templates. *Required unless `generator` is set — but `generator` is not available to community catalog entries |
| `tags` | No | Array of kebab-case strings for toolbox filtering (e.g. `sensor`, `actuator`, `event`, `beginner`) |

### The `blockly` Section

This IS a standard Blockly JSON block definition, represented as a YAML mapping. The schema
allows any Blockly property. Only `type` is validated as required. Key properties:

```yaml
type: modulino_thermo_temperature
message0: "temperature °C"
args0: []
output: Number
tooltip: Read temperature in Celsius.
inputsInline: true
extensions:
  - hat_event_style    # add for hat/event blocks
```

The block `type` must be unique across the entire workspace. Convention: `<component>_<action>` in snake_case.

`helpUrl` is optional — see [Documentation Links](#documentation-links) for when to set it.

### The `codegen` Section

```yaml
imports:
  - "#include <Servo.h>"
declarations:
  - "Servo _servo;"
setup:
  - "_servo.attach({{PIN}});"
helpers:
  _mapAngle: "int {{FUNCTION_NAME}}(int v) { return constrain(v, 0, 180); }"
cleanup:
  - "_servo.detach();"
body:
  - "_servo.write(_mapAngle({{ANGLE}}))"
precedence: ATOMIC
inputDefaults:
  ANGLE: 90
```

| Field | Description |
|-------|-------------|
| `imports` | Array — `#include` / `import` lines. Deduplicated by resolved value |
| `declarations` | Array — global/module-level declarations. Deduplicated |
| `setup` | Array — one-shot init code. Deduplicated |
| `helpers` | Object — key = function name (dedup key), value = function body. Use `{{FUNCTION_NAME}}` |
| `cleanup` | Array — teardown code. Deduplicated |
| `body` | Array — inline code lines, joined with `\n`. Optional for setup-only or event blocks |
| `precedence` | String — operator precedence. Required for value blocks (`output` present) |
| `inputDefaults` | Object — fallback values for unconnected value inputs |

All string values support `{{placeholder}}` resolution:
- `{{fieldName}}` → `block.getFieldValue(fieldName)`. For `field_variable`, resolves to the language-safe variable name (not the raw variable ID).
- `{{inputName}}` → `generator.valueToCode(block, inputName, order)`
- `{{statementName}}` → `generator.statementToCode(block, statementName)`

Placeholder names MUST match the `name` attributes in the `blockly` section's `args` arrays.

### Precedence Values

For value blocks only. Maps to Blockly's `Order` enum:

| Value | Meaning | Example |
|-------|---------|---------|
| `ATOMIC` | Never needs parentheses | Function calls, literals, property access |
| `UNARY_PREFIX` | Unary prefix operators | `!x`, `-x` |
| `MULTIPLICATION` | `*`, `/`, `%` | `a * b` |
| `ADDITION` | `+`, `-` | `a + b` |
| `RELATIONAL` | `<`, `>`, `<=`, `>=` | `a > b` |
| `EQUALITY` | `==`, `!=` | `a == b` |
| `LOGICAL_AND` | `&&` | `a && b` |
| `LOGICAL_OR` | `\|\|` | `a \|\| b` |
| `NONE` | Always needs parentheses | Complex expressions |

When in doubt, use `ATOMIC` — it's safe for any single function call or property access.

## Documentation Links

Two fields carry documentation URLs: `docs` (per catalog entry) and `helpUrl` (per block, inside `blockly`).

### `docs` (catalog entry level)

A free-form map of key→URL pairs. Each key becomes a context menu item on
every block in the entry — the key is transformed into a human-readable label
(e.g. `library` → "Library", `api_reference` → "Api Reference").

```yaml
docs:
  datasheet: "https://docs.arduino.cc/hardware/modulino-thermo"
  library: "https://www.arduino.cc/reference/en/libraries/modulino/"
```

**Common keys** (use only the ones that apply — any key is valid):

| Key | Points to | Example |
|-----|-----------|---------|
| `datasheet` | Hardware product page with pinout, specs, wiring | `docs.arduino.cc/hardware/modulino-thermo` |
| `library` | Library reference page (API listing) | `arduino.cc/reference/en/libraries/modulino/` |
| `api` | Brick, function or service API docs specific to this entry | A page documenting *this entry's* endpoints/classes |

**Rules**:

- Every URL must point to a page **specific to this catalog entry**. A generic landing page shared by many entries (e.g. a docs index that covers all bricks) is not useful — omit the key instead.
- Only include a key if you can verify the URL resolves to real, maintained content. Do not guess URLs based on naming patterns — check that the page exists.
- `datasheet` is for hardware components only (Modulino, shields, breakouts). Do not use it for software-only entries.
- Use `snake_case` or plain lowercase for keys — they are converted to Title Case for display.
- Omit `docs` entirely for builtin programming blocks (math, logic, loops, serial) — there is no external hardware documentation to link.

### `helpUrl` (block level)

Standard Blockly property. Sets the URL opened by the built-in "Help" context menu item for a single block.

```yaml
blockly:
  type: modulino_thermo_temperature
  helpUrl: "https://docs.arduino.cc/hardware/modulino-thermo#reading-temperature"
```

**When to set it**: only when a block maps to a specific section or anchor within a documentation page — e.g. a particular API method, a wiring example for that exact sensor read. If the best link is the same page already in `docs.datasheet` or `docs.library`, do not repeat it in `helpUrl`.

**When to omit it**: if there is no block-specific page or anchor. An empty or generic `helpUrl` is worse than none — Blockly shows a grayed-out "Help" menu item that leads nowhere useful.

## YAML Gotchas

PyYAML (YAML 1.1) silently coerces certain bare words to booleans:
`on`/`off`/`yes`/`no`/`true`/`false`. This matters for `field_dropdown`
options and any string value that happens to match.

```yaml
# BROKEN — "on"/"off" become Python True/False, Blockly receives booleans
options:
  - - On
    - on
  - - Off
    - off

# CORRECT — quote any value that could be a YAML 1.1 boolean keyword
options:
  - - "On"
    - "on"
  - - "Off"
    - "off"
```

**Rule**: always quote dropdown option values. The JSON Schema cannot catch
this — the coercion happens at parse time before validation runs.

## Implementation-Level vs Block-Level Codegen

**Implementation-level** (`implementation.codegen`):
- Emitted ONCE if any block from this implementation is used
- Typical: shared `#include`, library object construction, `.begin()` calls

**Block-level** (`block.codegen`):
- Emitted per block instance
- Sections are deduplicated by resolved value — if two blocks produce the same setup line, it appears once

This two-level system avoids duplication: the library include and init go in implementation-level,
individual sensor reads go in block-level.

## Validation Command

Run from the root of the `arduino-app-blocks` repository. Validates against the bundled schema:

```bash
python3 - <<'EOF'
import yaml, json, jsonschema, glob, os, sys

# The schema ships in this repo — validate against the local file (no network).
schema = json.load(open("src/catalog/block-catalog_v1.schema.json"))

files = sys.argv[1:] or glob.glob("catalogs/**/*.yaml", recursive=True)
errors = []
for f in sorted(files):
    try:
        for entry in yaml.safe_load_all(open(f)):
            if entry:
                jsonschema.validate(entry, schema)
        print(f"OK  {os.path.basename(f)}")
    except jsonschema.ValidationError as e:
        errors.append(f)
        print(f"ERR {os.path.basename(f)}: {e.message}")
print(f"\n{len(files) - len(errors)}/{len(files)} valid")
EOF
```
