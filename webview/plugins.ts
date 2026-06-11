import * as Blockly from 'blockly';
import { TypedVariableModal } from '@blockly/plugin-typed-variable-modal';
import { PositionedMinimap } from '@blockly/workspace-minimap';

// Official Blockly field plugins.
// slider, dependent-dropdown, grid-dropdown, bitmap auto-register on import.
// angle, colour, hsv-sliders, multiline require an explicit registration call.
import '@blockly/field-slider';            // field_slider
import { registerFieldAngle } from '@blockly/field-angle';
import { registerFieldColour } from '@blockly/field-colour';
import '@blockly/field-dependent-dropdown'; // field_dependent_dropdown
import '@blockly/field-grid-dropdown';     // field_grid_dropdown
import './custom-fields/FieldThemedBitmap'; // field_bitmap (themed subclass)
import { FieldColourHsvSliders } from '@blockly/field-colour-hsv-sliders';
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import '@blockly/toolbox-search';          // toolbox category kind: "search"

// Workspace plugins
import { Backpack } from '@blockly/workspace-backpack';
import { ScrollOptions, ScrollBlockDragger, ScrollMetricsManager } from '@blockly/plugin-scroll-options';
import { shadowBlockConversionChangeListener } from '@blockly/shadow-block-converter';
import * as BlockDynamicConnection from '@blockly/block-dynamic-connection';
import { Multiselect } from '@mit-app-inventor/blockly-plugin-workspace-multiselect';

registerFieldAngle();
registerFieldColour();
registerFieldMultilineInput();
Blockly.fieldRegistry.register('field_colour_hsv_sliders', FieldColourHsvSliders);

import './custom-fields/FieldCombobox';
import './custom-fields/FieldTypedParamInput';
import './custom-fields/FieldCode';
import './custom-blocks/switchCaseBlock';
import './custom-blocks/cppProcedureBlocks';

export const CPP_VARIABLE_TYPES: [string, string][] = [
    ['int',     'int'],
    ['long',    'long'],
    ['int8_t',  'int8_t'],
    ['int16_t', 'int16_t'],
    ['int32_t', 'int32_t'],
    ['unsigned int',  'unsigned int'],
    ['unsigned long', 'unsigned long'],
    ['byte',     'byte'],
    ['word',     'word'],
    ['uint8_t',  'uint8_t'],
    ['uint16_t', 'uint16_t'],
    ['uint32_t', 'uint32_t'],
    ['float',  'float'],
    ['double', 'double'],
    ['bool',   'bool'],
    ['char',   'char'],
    ['String', 'String'],
];

const TYPED_VAR_CALLBACK_KEY = 'CREATE_TYPED_VARIABLE_BUTTON';

// Blockly's default is #57e — clear it so no arbitrary inline background
// is applied on selection; ThemeAdapter CSS handles the highlight using
// the VS Code selection token instead.
Blockly.ToolboxCategory.defaultBackgroundColour = '';

// ── OverlayCollapsibleCategory ──────────────────────────────────────
// Blockly's built-in CollapsibleToolboxCategory calls
// parentToolbox_.handleToolboxItemResize() at the end of setExpanded(),
// which re-translates the workspace to account for the flyout width
// and pushes the workspace to the right.  Leaf categories never trigger
// this, so their flyout opens as a simple overlay.
//
// This subclass overrides setExpanded() to skip handleToolboxItemResize,
// making the flyout behaviour consistent: always overlay, never push.
class OverlayCollapsibleCategory extends Blockly.CollapsibleToolboxCategory {
    override setExpanded(isExpanded: boolean): void {
        if (this.expanded_ === isExpanded) return;
        this.expanded_ = isExpanded;

        const subcatDiv = this.subcategoriesDiv_!;
        if (isExpanded) {
            subcatDiv.style.display = 'block';
            this.openIcon_(this.iconDom_);
        } else {
            (this.parentToolbox_ as any).getFlyout?.()?.setVisible(false);
            subcatDiv.style.display = 'none';
            this.closeIcon_(this.iconDom_);
        }
        Blockly.utils.aria.setState(
            this.htmlDiv_!,
            Blockly.utils.aria.State.EXPANDED,
            isExpanded,
        );
        // Intentionally omit handleToolboxItemResize() — the flyout
        // should overlay the workspace, not push it.
    }
}

Blockly.registry.unregister(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.CollapsibleToolboxCategory.registrationName,
);
Blockly.registry.register(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.CollapsibleToolboxCategory.registrationName,
    OverlayCollapsibleCategory,
);

// Flyout buttons are SVG <g> elements, so CSS padding has no effect — their
// box is sized in JS as textSize + 2 × these margins, written straight to the
// rect's width/height attributes. Bump the statics to give the button (e.g.
// "Create typed variable…") VS Code-button-like padding.
Blockly.FlyoutButton.TEXT_MARGIN_X = 12;
Blockly.FlyoutButton.TEXT_MARGIN_Y = 6;

let _dynamicVarPatched = false;
function patchDynamicVariableBlocks(): void {
    if (_dynamicVarPatched) return;
    _dynamicVarPatched = true;

    const noop = function(): void {};

    const setDef = Blockly.Blocks['variables_set_dynamic'];
    if (setDef) {
        const originalSetInit = setDef.init as (this: Blockly.Block) => void;
        Blockly.Blocks['variables_set_dynamic'] = {
            ...setDef,
            init(this: Blockly.Block): void {
                originalSetInit.call(this);
                this.getInput('VALUE')?.setCheck(null);
                (this as unknown as { onchange: () => void }).onchange = noop;
            },
        };
    }

    const getDef = Blockly.Blocks['variables_get_dynamic'];
    if (getDef) {
        const originalGetInit = getDef.init as (this: Blockly.Block) => void;
        Blockly.Blocks['variables_get_dynamic'] = {
            ...getDef,
            init(this: Blockly.Block): void {
                originalGetInit.call(this);
                this.outputConnection?.setCheck(null);
                (this as unknown as { onchange: () => void }).onchange = noop;
            },
        };
    }
}

/**
 * Custom TypedVariableModal with inline-styled rendering that matches
 * the FieldTypedParamInput dropdown look. We override renderContent_
 * to bypass the plugin's CSS (which we cannot reliably override from
 * the webview <style> tag).
 */
class StyledTypedVariableModal extends TypedVariableModal {
    show() {
        super.show();
        // After the modal DOM is live, patch inline styles.
        requestAnimationFrame(() => this.patchModalStyles_());
    }

    private patchModalStyles_(): void {
        const overlay = (this as any).htmlDiv_ as HTMLElement | null;
        if (!overlay) return;

        const container = overlay.querySelector('.blocklyModalContainer') as HTMLElement | null;
        if (!container) return;

        // Container
        Object.assign(container.style, {
            width: 'fit-content',
            maxWidth: '90%',
            minWidth: '240px',
            position: 'relative',
            padding: '14px',
            borderRadius: '4px',
        });

        // Close button — equidistant from top-right corner
        const closeBtn = container.querySelector('.blocklyModalBtnClose') as HTMLElement | null;
        if (closeBtn) {
            Object.assign(closeBtn.style, {
                position: 'absolute',
                top: '12px',
                right: '12px',
            });
        }

        // Title
        const title = container.querySelector('.blocklyModalHeaderTitle') as HTMLElement | null;
        if (title) {
            Object.assign(title.style, {
                fontSize: '13px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
            });
        }

        // Variable name input container — flex row
        const nameContainer = container.querySelector('.typedModalVariableInputContainer') as HTMLElement | null;
        if (nameContainer) {
            Object.assign(nameContainer.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                margin: '12px 0 16px 0',
            });
        }

        // Variable name label
        const nameLabel = container.querySelector('.typedModalVariableLabel') as HTMLElement | null;
        if (nameLabel) {
            Object.assign(nameLabel.style, {
                fontSize: '12px',
                minWidth: '36px',
                marginRight: '0',
            });
        }

        // Variable name input
        const nameInput = container.querySelector('.typedModalVariableNameInput') as HTMLElement | null;
        if (nameInput) {
            Object.assign(nameInput.style, {
                flex: '1',
                boxSizing: 'border-box',
                padding: '4px 6px',
                fontSize: '13px',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '3px',
                background: 'rgba(0,0,0,0.3)',
                color: 'inherit',
                outline: 'none',
            });
        }

        // "Variable Types" div — separator + header style
        const typesDiv = container.querySelector('.typedModalTypes') as HTMLElement | null;
        if (typesDiv) {
            Object.assign(typesDiv.style, {
                borderTop: '1px solid rgba(255,255,255,0.15)',
                paddingTop: '10px',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.6)',
            });
        }

        // Type list UL — vertical column
        const typeList = container.querySelector('.typedModalList') as HTMLElement | null;
        if (typeList) {
            Object.assign(typeList.style, {
                display: 'flex',
                flexDirection: 'column',
                padding: '0',
                margin: '10px 0 16px 0',
                maxHeight: '220px',
                overflowY: 'auto',
            });
        }

        // Individual type items
        const items = container.querySelectorAll('.typedModalList li');
        items.forEach((li) => {
            const el = li as HTMLElement;
            Object.assign(el.style, {
                display: 'flex',
                alignItems: 'center',
                margin: '0',
                padding: '4px 8px',
                cursor: 'pointer',
                borderRadius: '2px',
            });
            el.addEventListener('mouseenter', () => { el.style.background = 'rgba(255,255,255,0.1)'; });
            el.addEventListener('mouseleave', () => { el.style.background = ''; });
        });

        // Labels — ensure visible
        const labels = container.querySelectorAll('.typedModalTypes label');
        labels.forEach((label) => {
            const el = label as HTMLElement;
            Object.assign(el.style, {
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                color: 'inherit',
            });
        });

        // Footer buttons — compact
        const footer = container.querySelector('.blocklyModalFooter') as HTMLElement | null;
        if (footer) {
            Object.assign(footer.style, {
                display: 'flex',
                gap: '6px',
                justifyContent: 'flex-start',
            });
        }
        const btns = container.querySelectorAll('.blocklyModalFooter .blocklyModalBtn');
        btns.forEach((btn) => {
            const el = btn as HTMLElement;
            Object.assign(el.style, {
                padding: '4px 14px',
                fontSize: '12px',
                borderRadius: '3px',
                marginRight: '0',
            });
        });
    }
}

/**
 * PositionedMinimap subclass that exposes the internal minimap workspace
 * so ThemeAdapter can apply the VS Code theme to it.
 */
export class ThemedMinimap extends PositionedMinimap {
    /** Access the minimap's internal workspace (protected in base class). */
    getMinimapWorkspace(): Blockly.WorkspaceSvg | null {
        return this.minimapWorkspace;
    }

    /** Force dark theme on the minimap and sync existing blocks. */
    applyDarkTheme(primaryWorkspace: Blockly.WorkspaceSvg): void {
        const mmWs = this.minimapWorkspace;
        if (!mmWs) return;

        // Sync theme so blocks render with correct colours
        mmWs.setTheme(primaryWorkspace.getTheme());

        // Copy existing blocks into the minimap (the listener only
        // catches events AFTER init, so pre-existing blocks are missed)
        const state = Blockly.serialization.workspaces.save(primaryWorkspace);
        Blockly.serialization.workspaces.load(state, mmWs);
        mmWs.zoomToFit();

        // Defer DOM styling so the SVG has rendered
        requestAnimationFrame(() => {
            const wrapper = this.minimapWrapper;
            if (!wrapper) return;

            const bg = getComputedStyle(document.body)
                .getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';

            wrapper.querySelectorAll('.blocklySvg').forEach(el => {
                (el as HTMLElement).style.setProperty('background-color', bg, 'important');
            });
            wrapper.querySelectorAll('.blocklyMainBackground').forEach(el => {
                (el as SVGElement).style.setProperty('fill', bg, 'important');
                el.setAttribute('fill', bg);
            });
            wrapper.querySelectorAll('.blocklyScrollbarHorizontal, .blocklyScrollbarVertical').forEach(el => {
                (el as HTMLElement).style.display = 'none';
            });
        });
    }
}

/**
 * Inject-time plugin options that must be passed to Blockly.inject().
 * Merge these into the inject options object.
 */
export const pluginInjectOptions = {
    plugins: {
        blockDragger: ScrollBlockDragger,
        metricsManager: ScrollMetricsManager,
        connectionPreviewer: BlockDynamicConnection.decoratePreviewer(
            Blockly.InsertionMarkerPreviewer,
        ),
    },
};

/**
 * Initialize workspace-level plugins that require a live workspace.
 * Call once after Blockly.inject().
 */
export function initWorkspacePlugins(workspace: Blockly.WorkspaceSvg): () => void {
    const scrollOptions = new ScrollOptions(workspace);
    scrollOptions.init();

    const backpack = new Backpack(workspace);
    backpack.init();

    workspace.addChangeListener(shadowBlockConversionChangeListener);
    workspace.addChangeListener(BlockDynamicConnection.finalizeConnections);

    const multiselect = new Multiselect(workspace);
    multiselect.init({
        useDoubleClick: false,
        bumpNeighbours: false,
        multiselectIcon: { hideIcon: false, weight: 3 },
    });

    return () => {
        backpack.dispose();
        multiselect.dispose();
        workspace.removeChangeListener(shadowBlockConversionChangeListener);
        workspace.removeChangeListener(BlockDynamicConnection.finalizeConnections);
    };
}

export function initTypedVariableModal(
    workspace: Blockly.WorkspaceSvg,
    types: [string, string][],
    blockMessages?: Record<string, string>,
): () => void {
    patchDynamicVariableBlocks();

    const createFlyout = (ws: Blockly.WorkspaceSvg): Element[] => {
        const button = document.createElement('button');
        button.setAttribute('text', Blockly.Msg['NEW_TYPED_VARIABLE'] ?? 'Create variable…');
        button.setAttribute('callbackKey', TYPED_VAR_CALLBACK_KEY);
        const varBlocks = Blockly.VariablesDynamic.flyoutCategoryBlocks(ws);
        return [button, ...varBlocks];
    };

    workspace.registerToolboxCategoryCallback(
        'CREATE_TYPED_VARIABLE',
        createFlyout,
    );

    const modal = new StyledTypedVariableModal(workspace, TYPED_VAR_CALLBACK_KEY, types, blockMessages);
    modal.init();

    return () => {
        modal.dispose();
        workspace.removeToolboxCategoryCallback('CREATE_TYPED_VARIABLE');
    };
}