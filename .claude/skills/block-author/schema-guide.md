# Block Catalog v1 Schema Guide

Schema published at:
`https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json`

Catalog files are authored as **YAML**; the JSON Schema validates the parsed data model.
The `blockly` section inside each block is verbatim Blockly JSON (represented as a YAML
mapping — no special syntax needed).

Add this header to every catalog file for in-editor schema validation:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json
```

## Catalog Entry (top level)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json
id: modulino-thermo
displayName:
  en: Modulino Thermo
  it: Modulino Thermo
category: modulino
docs:
  datasheet: https://docs.arduino.cc/hardware/modulino-thermo
  library: https://www.arduino.cc/reference/en/libraries/modulino/
implementations:
  - ...
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Kebab-case for external catalog entries (e.g. `modulino-thermo`). |
| `displayName` | Yes | String or `{ en: "...", it: "..." }` locale map |
| `category` | Yes | Toolbox category. Use `::` for subcategories (e.g. `I/O::Digital`, `Communication::Serial`). Flat when no `::` (e.g. `Modulino`, `Detection`). |
| `docs` | No | URL map for documentation links |
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
| `apiReference` | No | URL to the library's API docs |
| `repository` | No | URL to the library's source repo |

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
  colour: 30
  tooltip: Read temperature in Celsius.
  helpUrl: https://docs.arduino.cc/hardware/modulino-thermo
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
colour: 30
tooltip: Read temperature in Celsius.
helpUrl: https://docs.arduino.cc/hardware/modulino-thermo
inputsInline: true
extensions:
  - hat_event_style    # add for hat/event blocks
```

The block `type` must be unique across the entire workspace. Convention: `<component>_<action>` in snake_case.

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

Run from the root of the `arduino-app-blocks` repository. Fetches the schema automatically:

```bash
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
