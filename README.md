# Arduino App Blocks

Community block catalog for [Arduino App Lab](https://github.com/arduino/arduino-app-lab) —
the visual programming environment for dual-brain Arduino boards (UNO Q, VentUno Q).

Each file in `catalogs/` describes one hardware component or software service as a set of
Blockly visual blocks. App Lab loads these entries at runtime and adds them to the block
toolbox alongside the built-in Arduino blocks.

**No local App Lab checkout needed.** To contribute, you only need this repository.

---

## What's in the catalog

```
catalogs/
  modulino/          Modulino I2C component family       (C++ + Python)
  detection/         AI detection bricks                 (Python)
  ai/                LLM / VLM language model bricks     (Python)
  speech/            ASR / TTS bricks                    (Python)
  web-ui/            WebUI brick                         (Python)
  storage/           Time-series and SQL bricks          (Python)
  cloud/             Arduino IoT Cloud brick             (Python)
```

### Modulino components

| File | Component | Blocks |
|---|---|---|
| `knob.yaml` | Modulino Knob (rotary encoder) | read value, set position, read button |
| `buttons.yaml` | Modulino Buttons | update, pressed(A/B/C), set LEDs |
| `pixels.yaml` | Modulino Pixels (RGB LED array) | set, clear, clear all, show |
| `thermo.yaml` | Modulino Thermo (temp + humidity) | read temperature, read humidity |
| `distance.yaml` | Modulino Distance (time-of-flight) | available, get distance |
| `light.yaml` | Modulino Light (ambient + colour) | read lux, read colour |
| `movement.yaml` | Modulino Movement (IMU) | update, acceleration/gyro per axis |
| `joystick.yaml` | Modulino Joystick | update, X, Y, button |
| `buzzer.yaml` | Modulino Buzzer | tone, stop |
| `vibro.yaml` | Modulino Vibro | vibrate, stop |
| `latch-relay.yaml` | Modulino Latch Relay | on, off, status |

### AI and brick services

| File | Service | Blocks |
|---|---|---|
| `ai/ai.yaml` | Cloud LLM, Edge LLM, VLM | prompt, stream, ask image, clear memory |
| `detection/detection.yaml` | Object/keyword/gesture/motion detection | event hat blocks + single-shot value blocks |
| `speech/speech.yaml` | ASR (speech to text) + TTS | on transcript, speak, cancel |
| `web-ui/web-ui.yaml` | WebUI brick | on message, send, expose API |
| `storage/storage.yaml` | Time-series + SQL store | write/read (TS and SQL) |
| `cloud/cloud.yaml` | Arduino IoT Cloud | on variable change |

---

## Adding blocks

There are two paths: **AI-assisted** (recommended) and **manual**.

### AI-assisted authoring

Open this repository in [Claude Code](https://claude.ai/code).
The **block-author** skill is preconfigured in `.claude/skills/block-author/` and activates
automatically when you describe a component.

Example prompts:

```
Create blocks for the Grove Ultrasonic Ranger sensor (C++ runtime, uses NewPing library)
```

```
Add Python blocks for the Modulino Pixels component
```

The skill will:
1. Ask you for the component datasheet and library documentation
2. Design the block set with you
3. Write the complete YAML
4. Validate it against the schema before showing you the result

### Manual authoring

#### 1. Set up IDE validation

Install the [Red Hat YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
for VS Code, then add this header to every new catalog file:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json
```

The extension will validate your file in real time as you type.

#### 2. Create the file

```
catalogs/<family>/<component-id>.yaml
```

For example: `catalogs/grove/ultrasonic.yaml`

#### 3. Write the catalog entry

Every file has this top-level structure:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/arduino-app-lab/main/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json
id: grove-ultrasonic
displayName:
  en: Grove Ultrasonic Ranger
category: Sensors
docs:
  product: https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/
  library: https://github.com/Seeed-Studio/Seeed_Arduino_UltrasonicRanger
implementations:
  - runtime: "arduino:cpp"
    dependencies:
      - type: library
        name: Grove Ultrasonic Ranger
        minVersion: "1.0.1"
    codegen:
      imports:
        - "#include <Ultrasonic.h>"
      declarations:
        - "Ultrasonic _ultrasonic_{{PIN}}({{PIN}});"
    blocks:
      - blockly:
          type: grove_ultrasonic_distance
          message0: "ultrasonic distance on pin %1"
          args0:
            - type: field_number
              name: PIN
              value: 7
          output: Number
          colour: "#26A69A"
          tooltip: "Returns the distance measured by the Grove Ultrasonic Ranger in cm."
          helpUrl: "https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/"
        codegen:
          body:
            - "_ultrasonic_{{PIN}}.MeasureInCentimeters()"
          precedence: ATOMIC
```

#### 4. Block structure reference

**Choose an archetype for each block:**

| Archetype | Blockly keys | Use when |
|---|---|---|
| Value block | `output` | Returns a value (sensor read, calculation) |
| Statement block | `previousStatement` + `nextStatement` | Performs an action |
| Terminal statement | `previousStatement` only | Ends a flow (break, return) |
| Hat / Event block | `nextStatement` only + `extensions: ["hat_event_style"]` | Starts a flow on an event |
| Setup-only block | `previousStatement` + `nextStatement`, no `body` in codegen | Configures something once |

**Codegen sections** (emitted into the generated sketch):

| Section | C++ destination | Python destination |
|---|---|---|
| `imports` | `#include` zone | `import` zone |
| `declarations` | Global scope, before `setup()` | Module level, after imports |
| `setup` | Inside `void setup()` | Module level, before `def loop()` |
| `helpers` | Function definitions before `setup()` | `def` blocks at module level |
| `body` | Inline at block position | Inline at block position |
| `cleanup` | After main loop | After main loop |

`imports`, `declarations`, `setup`, and `helpers` are **deduplicated globally** — safe to repeat across blocks of the same family. `body` is emitted once per block instance.

**Placeholder syntax** in codegen strings:

| Placeholder | Resolved from |
|---|---|
| `{{FIELD_NAME}}` | `getFieldValue("FIELD_NAME")` |
| `{{INPUT_NAME}}` | `valueToCode(block, "INPUT_NAME")` |
| `{{STATEMENT_NAME}}` | `statementToCode(block, "STATEMENT_NAME")` |

**`precedence`** is required on every value block. Use `ATOMIC` for function calls and literals;
`NONE` when the expression needs wrapping parentheses in compound contexts.

**Event / callback pattern** (hat block, no `body`):

```yaml
codegen:
  declarations:
    - "def _on_keyword_{{KEYWORD}}({{RESULT_VAR}}):\n  {{DO}}"
  setup:
    - "_kws = KeywordSpotter()\n_kws.on_keyword('{{KEYWORD}}', _on_keyword_{{KEYWORD}})"
```

The declaration string is content-hashed — two instances with different `{{KEYWORD}}` or
`{{DO}}` produce two separate callback functions.

**YAML 1.1 boolean gotcha** — PyYAML coerces bare `on`, `off`, `yes`, `no` to booleans.
Always quote dropdown option values:

```yaml
# Wrong
options:
  - [On, on]
# Correct
options:
  - ["On", "on"]
```

#### 5. Validate

```bash
pip install pyyaml jsonschema   # once

python3 - <<'EOF'
import yaml, json, jsonschema, urllib.request, glob, os, sys

SCHEMA_URL = (
    "https://raw.githubusercontent.com/linucs/arduino-app-lab/main"
    "/ui-packages/ui-components/lib/blockly-editor/schemas/block-catalog_v1.schema.json"
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

Pass a specific file path as argument to validate only that file:

```bash
python3 - catalogs/grove/ultrasonic.yaml <<'EOF'
...
EOF
```

---

## Conventions

| Rule | Detail |
|---|---|
| One file per component family | All runtimes (C++ + Python) in one file |
| `id` is kebab-case | `modulino-knob`, `grove-ultrasonic` |
| `blockly.type` is snake_case and permanent | `modulino_knob_value`. Never rename after shipping — it breaks saved workspaces |
| Dropdown option values are always quoted | `"on"`, `"off"`, `"yes"`, `"no"` |
| No `generator:` field in community entries | Use `codegen` only. The imperative `generator` tier requires TypeScript registration inside the App Lab binary |
| Colour follows category | Blocks inherit the colour of their toolbox category. If you override, stay consistent within the family |

**Established colour palette** (for overrides or new families):

| Family | Colour |
|---|---|
| Modulino | `20` (orange) |
| Detection | `200` (teal) |
| AI | `270` (purple) |
| WebUI | `190` (cyan) |
| Storage | `60` (yellow) |
| Speech | `120` (green) |
| Cloud | `230` (blue) |

---

## Reference documentation

All detail-level documentation lives in `.claude/skills/block-author/` and is used
automatically by the AI-assisted workflow:

| File | Contents |
|---|---|
| `SKILL.md` | Full authoring workflow, all 6 steps, quality checklist |
| `schema-guide.md` | Complete schema reference with annotated examples |
| `blockly-anatomy.md` | Block archetypes, input types, field types, type-check groups |
| `mutator-patterns.md` | Advanced mutator architecture (first-party App Lab blocks only) |

---

## Contributing

1. Fork this repository
2. Create your catalog file in `catalogs/<family>/`
3. Validate with the script above
4. Open a pull request

CI will re-run schema validation on every PR. Smoke-test compilation on UNO Q hardware
runs in the `arduino-app-lab` repository and is triggered automatically when a catalog
release is published.
