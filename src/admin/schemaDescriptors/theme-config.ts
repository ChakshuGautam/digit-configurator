import type { SchemaDescriptor } from './types';

/**
 * Descriptor for `common-masters.ThemeConfig` — the per-tenant UI color palette
 * (e.g. the "kenya-green" record driving Nairobi's green/red DIGIT theme).
 *
 * The JSON Schema declares `colors` as an untyped `type: "object"`, so the
 * default auto-form would skip it entirely. The live records, however, carry
 * a deep tree of named color tokens (primary, link, text, grey, alerts,
 * digitv2 chart/alert tokens, etc). This descriptor expands every leaf color
 * into its own `color` widget addressed by a dot path (e.g. `colors.primary.main`).
 *
 * Parent objects (`colors`, `colors.primary`, ...) are intentionally NOT listed
 * as fields — the generic fallback skips them, which is what we want. Only the
 * string-valued leaves are editable.
 */
export const themeConfigDescriptor: SchemaDescriptor = {
  schema: 'common-masters.ThemeConfig',
  groups: [
    { title: 'Identity', fields: ['code', 'name', 'version'] },
    { title: 'Primary / Link', fields: [
      'colors.primary.main',
      'colors.primary.dark',
      'colors.primary.light',
      'colors.primary.accent',
      'colors.primary.selected-bg',
      'colors.link.normal',
      'colors.link.hover',
      'colors.secondary',
      'colors.border',
      'colors.input-border',
    ] },
    { title: 'Text', fields: [
      'colors.text.primary',
      'colors.text.secondary',
      'colors.text.heading',
      'colors.text.muted',
    ] },
    { title: 'Grey', fields: [
      'colors.grey.light',
      'colors.grey.lighter',
      'colors.grey.bg',
      'colors.grey.mid',
      'colors.grey.dark',
      'colors.grey.disabled',
    ] },
    { title: 'Alerts & Status', fields: [
      'colors.success',
      'colors.error',
      'colors.error-dark',
      'colors.info-dark',
      'colors.warning-dark',
    ] },
    { title: 'Charts', fields: [
      'colors.digitv2.chart-1',
      'colors.digitv2.chart-2',
      'colors.digitv2.chart-3',
      'colors.digitv2.chart-4',
      'colors.digitv2.chart-5',
    ] },
    { title: 'DigitV2 tokens', fields: [
      'colors.digitv2.primary-bg',
      'colors.digitv2.header-sidenav',
      'colors.digitv2.alert-info',
      'colors.digitv2.alert-info-bg',
      'colors.digitv2.alert-error-bg',
      'colors.digitv2.alert-success-bg',
      'colors.digitv2.text-color-disabled',
    ] },
  ],
  fields: [
    // --- Identity ---
    { path: 'code', widget: 'text', required: true,
      help: 'Unique theme identifier, e.g. "kenya-green". Used as the MDMS record key.' },
    { path: 'name', widget: 'text',
      help: 'Human-readable theme name shown in admin UIs.' },
    { path: 'version', widget: 'text',
      help: 'Optional version string, e.g. "1.0.0". Bump when shipping breaking token changes.' },

    // --- Primary / Link ---
    { path: 'colors.primary.main', widget: 'color', label: 'Primary / main',
      help: 'The brand color — buttons, highlights, active nav.' },
    { path: 'colors.primary.dark', widget: 'color', label: 'Primary / dark',
      help: 'Darker shade of primary, used for hover / pressed states.' },
    { path: 'colors.primary.light', widget: 'color', label: 'Primary / light',
      help: 'Lighter shade of primary, used for soft backgrounds.' },
    { path: 'colors.primary.accent', widget: 'color', label: 'Primary / accent',
      help: 'Secondary accent color paired with primary (e.g. the red in kenya-green).' },
    { path: 'colors.primary.selected-bg', widget: 'color', label: 'Primary / selected-bg',
      help: 'Background tint for selected rows / active menu items.' },
    { path: 'colors.link.normal', widget: 'color', label: 'Link / normal',
      help: 'Default anchor color.' },
    { path: 'colors.link.hover', widget: 'color', label: 'Link / hover',
      help: 'Anchor color on hover / focus.' },
    { path: 'colors.secondary', widget: 'color',
      help: 'Secondary brand color, typically used for headings / dark UI.' },
    { path: 'colors.border', widget: 'color',
      help: '1px divider color, e.g. between rows in a table.' },
    { path: 'colors.input-border', widget: 'color',
      help: 'Border color for form inputs in their default (unfocused) state.' },

    // --- Text ---
    { path: 'colors.text.primary', widget: 'color', label: 'Text / primary',
      help: 'Main body text color.' },
    { path: 'colors.text.secondary', widget: 'color', label: 'Text / secondary',
      help: 'De-emphasized text (captions, metadata).' },
    { path: 'colors.text.heading', widget: 'color', label: 'Text / heading',
      help: 'Color for h1–h6 headings.' },
    { path: 'colors.text.muted', widget: 'color', label: 'Text / muted',
      help: 'Faintest text — placeholders, disabled labels.' },

    // --- Grey scale ---
    { path: 'colors.grey.light', widget: 'color', label: 'Grey / light',
      help: 'Lightest grey — page background.' },
    { path: 'colors.grey.lighter', widget: 'color', label: 'Grey / lighter',
      help: 'Slightly darker than `light`; section dividers / zebra rows.' },
    { path: 'colors.grey.bg', widget: 'color', label: 'Grey / bg',
      help: 'Neutral card / panel background.' },
    { path: 'colors.grey.mid', widget: 'color', label: 'Grey / mid',
      help: 'Mid grey for subtle borders / rule lines.' },
    { path: 'colors.grey.dark', widget: 'color', label: 'Grey / dark',
      help: 'Darker grey for icons and secondary chrome.' },
    { path: 'colors.grey.disabled', widget: 'color', label: 'Grey / disabled',
      help: 'Fill color for disabled buttons and inputs.' },

    // --- Alerts & Status ---
    { path: 'colors.success', widget: 'color',
      help: 'Success / positive state (checkmarks, success toasts).' },
    { path: 'colors.error', widget: 'color',
      help: 'Error / destructive state (validation errors, delete buttons).' },
    { path: 'colors.error-dark', widget: 'color',
      help: 'Darker error shade — hover state for error buttons / text.' },
    { path: 'colors.info-dark', widget: 'color',
      help: 'Darker info shade — used on info text over light backgrounds.' },
    { path: 'colors.warning-dark', widget: 'color',
      help: 'Darker warning shade — used on warning text over light backgrounds.' },

    // --- Charts (digitv2) ---
    { path: 'colors.digitv2.chart-1', widget: 'color', label: 'DigitV2 / chart-1',
      help: 'First series color in charts (bars, lines, pie slice 1).' },
    { path: 'colors.digitv2.chart-2', widget: 'color', label: 'DigitV2 / chart-2',
      help: 'Second chart series color.' },
    { path: 'colors.digitv2.chart-3', widget: 'color', label: 'DigitV2 / chart-3',
      help: 'Third chart series color.' },
    { path: 'colors.digitv2.chart-4', widget: 'color', label: 'DigitV2 / chart-4',
      help: 'Fourth chart series color.' },
    { path: 'colors.digitv2.chart-5', widget: 'color', label: 'DigitV2 / chart-5',
      help: 'Fifth chart series color.' },

    // --- DigitV2 UI tokens ---
    { path: 'colors.digitv2.primary-bg', widget: 'color', label: 'DigitV2 / primary-bg',
      help: 'Tinted background paired with primary — e.g. selected-card fill.' },
    { path: 'colors.digitv2.header-sidenav', widget: 'color', label: 'DigitV2 / header-sidenav',
      help: 'Background color for the top header and side navigation rail.' },
    { path: 'colors.digitv2.alert-info', widget: 'color', label: 'DigitV2 / alert-info',
      help: 'Info alert accent / icon color.' },
    { path: 'colors.digitv2.alert-info-bg', widget: 'color', label: 'DigitV2 / alert-info-bg',
      help: 'Info alert background fill.' },
    { path: 'colors.digitv2.alert-error-bg', widget: 'color', label: 'DigitV2 / alert-error-bg',
      help: 'Error alert background fill.' },
    { path: 'colors.digitv2.alert-success-bg', widget: 'color', label: 'DigitV2 / alert-success-bg',
      help: 'Success alert background fill.' },
    { path: 'colors.digitv2.text-color-disabled', widget: 'color', label: 'DigitV2 / text-color-disabled',
      help: 'Text color used on disabled controls in the DigitV2 component set.' },
  ],
};
