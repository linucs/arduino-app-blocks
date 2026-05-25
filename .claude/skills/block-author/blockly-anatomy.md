# Blockly Block Anatomy Reference

Source: https://developers.google.com/blockly/guides/create-custom-blocks/define/block-anatomy

## 5 Block Archetypes

Determined by the combination of top-level connections. A block with an `output` connection
CANNOT also have a `previousStatement` connection — they are mutually exclusive.

### 1. Value Block (expression)
Returns a value. Has `output` connection (jigsaw piece on left side).
```json
{ "output": "Number" }
```
Can connect to `input_value` slots on other blocks. Use for: sensor reads, calculations, constants, variable getters.

### 2. Statement Block (command)
Performs an action. Has `previousStatement` + `nextStatement` (notch top, tab bottom).
```json
{ "previousStatement": null, "nextStatement": null }
```
Stacks vertically. Use for: actuator commands, print, variable setters, function calls.

### 3. Terminal Statement (end of flow)
Like a statement but with NO `nextStatement` — nothing can stack below it.
```json
{ "previousStatement": null }
```
Use for: `break`, `return`, `stop all`.

### 4. Hat / Event Block (start of flow)
Has `nextStatement` but NO `previousStatement` — nothing can stack above it.
```json
{ "nextStatement": null }
```
Rendered with a rounded "hat" top. Use for: event handlers ("when button pressed"), program entry points.
Always add `"extensions": ["hat_event_style"]` for visual hat rendering.

### 5. Standalone / Root Block (no connections)
No connections at all. Floats independently in the workspace.
Use for: configuration blocks, comments, workspace annotations. Rare in hardware contexts.

## 4 Input Types

Inputs are the connection points within a block. Each input can hold fields before its connection.

### input_value
Creates a horizontal connection that accepts ONE value block (expression).
```json
{ "type": "input_value", "name": "ANGLE", "check": "Number" }
```
`check` restricts which value blocks can connect. Omit or set to `null` for any type.
Can be an array: `"check": ["Number", "Boolean"]`.

### input_statement
Creates a C-shaped slot that accepts a STACK of statement blocks.
```json
{ "type": "input_statement", "name": "DO" }
```
Use for: loop bodies, callback handlers, if-then bodies. A single statement input accepts N stacked blocks.

### input_dummy
A container for fields only — no connection. Forces fields onto a separate visual row.
```json
{ "type": "input_dummy" }
```

### input_end_row
Like dummy but explicitly forces a line break in the block's visual layout.
```json
{ "type": "input_end_row" }
```

## 8 Built-in Field Types

Fields are the editable/visible elements inside a block. Placed inside inputs.

| Type | JSON `type` | Description | Key properties |
|------|-------------|-------------|----------------|
| Text input | `field_input` | User types a string | `text` (default value) |
| Number | `field_number` | User types a number | `value`, `min`, `max`, `precision` |
| Dropdown | `field_dropdown` | Pick from fixed options | `options`: `[["label", "VALUE"], ...]` |
| Checkbox | `field_checkbox` | Boolean toggle | `checked`: `true` / `false` |
| Colour | `field_colour` | Colour picker | `colour`: `"#ff0000"` |
| Variable | `field_variable` | Pick/create a variable | `variable`, `variableTypes`, `defaultType` |
| Label | `field_label` | Non-editable text | `text` |
| Image | `field_image` | Inline icon | `src`, `width`, `height`, `alt` |

### Plugin Field Types

Available in App Lab:

| Type | Plugin | Description |
|------|--------|-------------|
| `field_dependent_dropdown` | `@blockly/field-dependent-dropdown` | Dropdown whose options change based on a parent dropdown |
| `field_grid_dropdown` | `@blockly/field-grid-dropdown` | Dropdown rendered as a grid of icons/images |
| `field_date` | `@blockly/field-date` | Date picker |
| `field_multilineinput` | `@blockly/field-multilineinput` | Multi-line text with resizable textarea overlay |

## `field_variable` and Code Generation

`field_variable` lets the user pick or create a workspace variable. In codegen templates:
- `{{VAR_NAME}}` (where `VAR_NAME` is the field's `name`) resolves to the **language-safe
  variable name** (e.g. `detection`, `my_result`), not the internal variable ID.

This is the standard pattern for event/callback blocks where the callback result needs to
be accessible inside the handler body:

```yaml
blockly:
  message0: "when event %1 do"
  args0:
    - type: field_variable
      name: RESULT_VAR
      variable: result
  message1: "%1"
  args1:
    - type: input_statement
      name: DO
  nextStatement: null
  extensions: ["hat_event_style"]

codegen:
  declarations:
    - "def _on_event({{RESULT_VAR}}):\n  {{DO}}"
  setup:
    - "source.on_event(_on_event)"
```

## Multi-Message Blocks

For complex block layouts with multiple rows, use `message0`/`args0`, `message1`/`args1`, etc.
Each message+args pair defines one visual row:

```json
{
  "message0": "if %1",
  "args0": [{ "type": "input_value", "name": "COND", "check": "Boolean" }],
  "message1": "do %1",
  "args1": [{ "type": "input_statement", "name": "DO" }]
}
```

## C++ Typed Variable Check Groups

Blockly uses exact string matching for connection checks. Standard blocks output `'Number'`,
`'String'`, `'Boolean'`. C++ typed variables output their type token verbatim (`'int'`, `'float'`).
A `check: Number` input therefore rejects an `int` typed variable.

Use these four groups on `input_value` `check` arrays:

| Group | When | `check` array |
|-------|------|---------------|
| **INT** | Pin numbers, counts, durations | `["Number", "int", "unsigned int", "long", "unsigned long", "byte", "word", "uint8_t", "uint16_t", "uint32_t", "int8_t", "int16_t", "int32_t"]` |
| **NUM** | Any numeric including float | `["Number", "int", "unsigned int", "long", "unsigned long", "byte", "word", "float", "double", "uint8_t", "uint16_t", "uint32_t", "int8_t", "int16_t", "int32_t"]` |
| **CHAR** | Single character | `["Number", "int", "char", "byte", "uint8_t", "int8_t"]` |
| **INT_OR_STR** | Overloaded (int or String) | `["Number", "int", "unsigned int", "long", "unsigned long", "byte", "word", "uint8_t", "uint16_t", "uint32_t", "int8_t", "int16_t", "int32_t", "String"]` |

`'Number'` is always included because Blockly's literal `math_number` block outputs `'Number'`.

`'String'` is simultaneously a Blockly built-in token and the Arduino C++ class name — use
`check: String` for string inputs; no extra C++ types needed.

## Connection Type Checks

Both `output`, `previousStatement`, and `nextStatement` accept type checks:
- `null` — accepts any type
- `"Number"` — accepts only Number
- `["Number", "Boolean"]` — accepts Number or Boolean

## Shadow Blocks

Shadow blocks are pre-attached default blocks (grey, replaceable). Defined in the toolbox,
not in the block definition. The catalog schema uses `codegen.inputDefaults` to declare
fallback values for unconnected value inputs — the factory renders these as shadow blocks.

## Mutators

Mutators allow blocks to change shape at runtime (add/remove inputs dynamically).

A block references a mutator by name:
```json
{ "mutator": "my_mutator_name" }
```

The mutator must be registered separately in JavaScript BEFORE the block is instantiated.
See `mutator-patterns.md` for implementation templates.

**Note for catalog contributors:** mutators that require custom TypeScript registration
are not available in community catalog entries. All common patterns (variable inputs,
optional sections) can be expressed via `@blockly/block-plus-minus` with the
declarative `codegen` tier — see existing catalog entries for examples.
