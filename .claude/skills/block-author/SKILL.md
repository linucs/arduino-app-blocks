---
name: block-author
description: >
  Author block catalog YAML files for Arduino App Lab's Blockly-based visual programming.
  Use this skill whenever the user wants to create new blocks, define a component catalog entry,
  generate Blockly block definitions, write code generation templates, or create mutator JS code.
  Trigger on: "new block", "create a block", "add a component", "modulino", "grove", "sensor block",
  "actuator block", "brick block", "catalog entry", "blockly block", "block for",
  "code generation template", "mutator", or any request involving visual block creation for
  Arduino hardware components. Also trigger when the user mentions specific Arduino hardware
  (Modulino, Grove, shields, sensors, actuators) in the context of App Lab or Blockly.
---

# Block Catalog Author

Generate block catalog YAML files for Arduino App Lab. Each catalog entry defines
a hardware component, brick service, or AI pattern with Blockly blocks and code
generation templates for dual-brain Arduino boards (UNO Q, VentUno Q).

## Before You Start

1. Read `blockly-anatomy.md` — understand the 5 block archetypes, 4 input types, 8 field types, and mutator system
2. Read `schema-guide.md` — understand the block catalog v1 schema structure
3. Validate your output using the command in **Step 5** (fetches the published schema automatically)

## Workflow

### Step 1 — Understand the Component

Ask the user:

1. **What is the component?** (e.g., "Modulino Knob", "Grove Ultrasonic Sensor", "custom I2C device")
2. **Which side of the board is it connected to?** MCU (sketch.ino / C++) or SBC (main.py / Python). This determines the `runtime`:
   - MCU → `"arduino:cpp"` — code goes in `sketch/sketch.ino`
   - SBC → `"arduino:python"` — code goes in `python/main.py`
   - If both sides need blocks, create two `implementations` in the same catalog entry
3. **Where is the documentation?** Ask for:
   - Datasheet or product page URL
   - Arduino library repository (for C++) or Brick source (for Python)
   - API reference or example code
   - Pinout / connection diagram if relevant

Fetch the documentation to understand the component's API before designing blocks. Read the library's header files or Python class to identify the key methods, constructors, and configuration options.

### Step 2 — Design the Block Set

For each block, decide:

**Which archetype?** (see `blockly-anatomy.md` for details)

| Archetype | When to use | `returns` / connections |
|-----------|-------------|----------------------|
| Value block | Reads a value (sensor, calculation) | Set `"output"` in blockly section |
| Statement block | Performs an action (write pin, send data) | Set `"previousStatement"` + `"nextStatement"` |
| Terminal statement | Ends a flow (break, return, stop) | Set `"previousStatement"` only |
| Hat / Event block | Starts a flow (on button press, on change) | Set `"nextStatement"` only, no `"previousStatement"` |
| Setup-only block | Configures something, no inline code | Statement block with `codegen` that has no `body` |

**What parameters does it need?**

- Use **fields** for edit-time choices the user picks from fixed options (dropdowns, numbers, checkboxes)
- Use **value inputs** for runtime expressions where the user connects other blocks (sensor values, variables, calculations)
- Use **statement inputs** for C-shaped body slots (callbacks, event handlers, loops)

**Does it need a mutator?** Only if the number of inputs varies at edit-time. Most hardware blocks don't. For the common case of "add/remove one item at a time", prefer `@blockly/block-plus-minus` (+/- buttons) over the full gear-icon mutator. Reserve the full mutator pattern for complex cases (see `mutator-patterns.md`).

### Step 3 — Write the YAML

Start each file with the language-server schema header for in-editor validation:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json
```

For each block, produce two sections:

**`blockly`** — the verbatim Blockly block definition. This is passed directly to `defineBlocksWithJsonArray()`. Use:
- `message0` / `args0` (and `message1` / `args1` for multi-row blocks)
- Standard Blockly field types (`field_dropdown`, `field_number`, `field_input`, `field_checkbox`, `field_variable`, `field_image`)
- Plugin field types (`field_dependent_dropdown` for cascading choices, `field_grid_dropdown` for icon/image grids, `field_date` for date pickers, `field_multilineinput` for multi-line text)
- Standard input types (`input_value` with `check`, `input_statement`, `input_dummy`)
- `colour` (HSV hue 0-360 or hex string) — keep consistent within a component family
- `tooltip` — describe what the block does, not how
- `helpUrl` — link to the component's documentation
- `inputsInline: true` when the block has few short inputs
- `extensions: ["hat_event_style"]` for event hat blocks

**`codegen`** — the code generation template. Use `{{placeholder}}` syntax:
- `{{fieldName}}` → resolved via `getFieldValue()`. For `field_variable`, resolves to the language-safe variable name.
- `{{inputName}}` → resolved via `valueToCode()`
- `{{statementName}}` → resolved via `statementToCode()` (returns body indented one level)

Structure the code across sections:
- `imports` — `#include` or `import` lines (deduplicated globally)
- `declarations` — global/module-level objects (deduplicated globally)
- `setup` — one-shot init code (deduplicated globally)
- `helpers` — utility functions (deduplicated by key)
- `body` — inline code where the block is placed (array of lines)
- `cleanup` — teardown code (deduplicated globally)
- `precedence` — REQUIRED for value blocks: `"ATOMIC"`, `"ADDITION"`, etc.

**Event / callback pattern** — use `declarations` + `setup` (no `body`):

```yaml
# Python event block example
codegen:
  declarations:
    - "def _on_event_{{TYPE}}({{RESULT_VAR}}):\n  {{DO}}"
  setup:
    - "_detector_{{TYPE}} = SomeBrick()"
    - "_detector_{{TYPE}}.on_event('{{TYPE}}', _on_event_{{TYPE}})"
```

The `declarations` key is content-hashed for deduplication: two blocks with different `{{TYPE}}` or `{{DO}}` produce separate functions. See existing blocks under `catalogs/` for complete examples.

### Step 4 — Add Metadata

- `tags` — for toolbox filtering: `"sensor"`, `"actuator"`, `"event"`, `"config"`, `"i2c"`, `"beginner"`, `"advanced"`, etc.
- `dependencies` — what the component needs:
  - `{ "type": "library", "name": "...", "minVersion": "..." }` for C++ Arduino libraries → `sketch.yaml`
  - `{ "type": "pip", "name": "...", "minVersion": "..." }` for Python packages
  - `{ "type": "brick", "name": "...", "variables": {...} }` for App Lab bricks → `app.yaml`

### Step 5 — Validate

Always validate the generated YAML against the published schema before presenting it to the user:

```bash
python3 - <<'EOF'
import yaml, json, jsonschema, urllib.request, sys

SCHEMA_URL = (
    "https://raw.githubusercontent.com/linucs/arduino-app-lab/main"
    "/app/common/schemas/v1/block-catalog_v1.schema.json"
)
schema = json.loads(urllib.request.urlopen(SCHEMA_URL).read())

import glob, os
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

Run it from the root of the `arduino-app-blocks` repository to validate all catalog files at once, or pass specific file paths as arguments.

> **No local App Lab checkout required.** The schema is fetched from the published repository. The only dependencies are `python3`, `pyyaml`, and `jsonschema` (`pip install pyyaml jsonschema`).

### Step 6 — The `generator:` field is off-limits for catalog entries

Catalog entries in this repository **must** use the declarative `codegen` section only.
The `generator:` field references a TypeScript class that must be registered inside the
App Lab binary before it can run. Entries that declare an unregistered generator are
refused at load time with a warning and silently dropped from the toolbox.

All patterns expressible with declarative templates — including event callbacks, ISR
functions, content-hashed declarations, and per-instance setup lines — should use `codegen`.
See `mutator-patterns.md` for the imperative tier's design, which is documented for
reference only and is not available to community catalog entries.

## Output Format

Always produce:
1. The complete catalog entry YAML file (one per component family)
2. The `# yaml-language-server` schema header at the top of each file

Name the YAML file: `<component-id>.yaml` (e.g., `knob.yaml`, `grove-ultrasonic.yaml`)
Place it in: `catalogs/<category>/` (e.g., `catalogs/modulino/`, `catalogs/grove/`)

## Common Patterns

**Simple sensor read (most common):**
- Value block, `"output": "Number"`, `precedence: "ATOMIC"`
- Implementation-level codegen for shared `#include` and object init
- Block-level codegen with just `body: ["object.readValue()"]`

**Actuator command:**
- Statement block, `previousStatement` + `nextStatement`
- Field dropdown for options, value input for dynamic parameters
- `body` calls the library method

**Configuration block (setup-only):**
- Statement block, no `body` in codegen
- Only `setup` section contributes code
- User places it in the workspace to configure, but no inline code is emitted

**Event / callback block:**
- Hat block (`nextStatement` only, no `previousStatement`)
- Statement input `DO` for the handler body
- `field_variable` for the callback result variable (`{{RESULT_VAR}}` resolves to the variable name)
- `extensions: ["hat_event_style"]` for visual hat rendering
- `declarations` for the callback function (content-hashed by resolved value)
- `setup` for event source instantiation and registration

**Multi-unit sensor (dropdown selects unit):**
- Value block with a `field_dropdown` for the unit
- `helpers` section with a conversion function
- `body` calls the helper with `{{UNIT}}` placeholder

## Quality Checklist

Before delivering, verify:

- [ ] Every `{{placeholder}}` in codegen matches a `name` in blockly's `args`
- [ ] Value blocks have `"output"` in blockly AND `"precedence"` in codegen
- [ ] Statement blocks have both `"previousStatement"` and `"nextStatement"` (unless terminal or hat)
- [ ] Hat blocks have `"nextStatement"` only and `extensions: ["hat_event_style"]`
- [ ] Implementation-level codegen covers shared imports/setup
- [ ] Block-level codegen only adds block-specific code
- [ ] Section deduplication works correctly: same-library blocks share imports, different-pin blocks get separate setup lines
- [ ] `dependencies` array includes all required libraries/bricks
- [ ] `tags` are assigned for toolbox filtering
- [ ] The YAML validates against the schema (Step 5)
- [ ] `# yaml-language-server` schema header is present at the top of each file
- [ ] Tooltips are user-friendly (describe *what*, not *how*)
- [ ] Block labels use Blockly `%N` placeholders correctly
- [ ] Colour is consistent within the component family
- [ ] Dropdown option values are quoted (YAML 1.1 coerces bare `on`/`off`/`yes`/`no` to booleans)
- [ ] No `generator:` field (community entries must use `codegen` only)
