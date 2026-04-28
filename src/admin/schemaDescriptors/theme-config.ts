import type { SchemaDescriptor } from './types';

/**
 * Descriptor for `common-masters.ThemeConfig` — v2 semantic shape.
 *
 * The runtime applyTheme.js (theflywheel/digit-ui-esbuild#66) expands these
 * 13 flat semantic keys into the 30+ CSS variables the existing CSS consumes,
 * so a tenant theme is now captured in roughly a dozen inputs instead of 35+.
 * That is what makes the "ship to a new client in a day" onboarding goal
 * practical.
 *
 * Old v1 records (nested groups like `colors.primary.main`) continue to
 * render correctly at runtime via the legacy v1 flatten path — they just
 * aren't editable through this trimmed form. Either re-enter the values as
 * v2 to migrate, or edit the raw JSON via MDMS API.
 *
 * Each input fans out to the CSS vars listed beside it; the help text
 * describes the surface effect, not the var names, so admins don't need to
 * know the underlying token taxonomy.
 */
export const themeConfigDescriptor: SchemaDescriptor = {
  schema: 'common-masters.ThemeConfig',
  customEditor: 'theme-config',
  groups: [
    { title: 'Identity', fields: ['code', 'name', 'version'] },
    { title: 'Brand & Surface', fields: [
      'colors.brand',
      'colors.brand-on',
      'colors.surface-header',
      'colors.surface-page',
      'colors.selected-bg',
    ] },
    { title: 'Text & Borders', fields: [
      'colors.text-primary',
      'colors.text-secondary',
      'colors.text-disabled',
      'colors.border',
    ] },
    { title: 'Status', fields: [
      'colors.error',
      'colors.success',
      'colors.info',
      'colors.warning',
    ] },
  ],
  fields: [
    // --- Identity ---
    { path: 'code', widget: 'text', required: true,
      help: 'Unique theme identifier, e.g. "kenya-green". Used as the MDMS record key.' },
    { path: 'name', widget: 'text',
      help: 'Human-readable theme name shown in admin UIs.' },
    { path: 'version', widget: 'text',
      help: 'Schema version — set to "2" for new themes (semantic shape).' },

    // --- Brand & Surface ---
    { path: 'colors.brand', widget: 'color', label: 'Brand',
      help: 'The primary brand color — buttons, highlights, active nav, focus rings. The most prominent color in the UI.' },
    { path: 'colors.brand-on', widget: 'color', label: 'Brand-on',
      help: 'The accent paired with brand — links, headings, button hover/pressed states. Usually a contrasting hue (e.g. dark green when brand is amber).' },
    { path: 'colors.surface-header', widget: 'color', label: 'Surface / header',
      help: 'Background of the top header bar and side navigation rail.' },
    { path: 'colors.surface-page', widget: 'color', label: 'Surface / page',
      help: 'Page background behind cards and panels. Usually a near-white grey.' },
    { path: 'colors.selected-bg', widget: 'color', label: 'Selected-bg',
      help: 'Soft tint for selected rows, active menu items, picked dropdown options. Typically a light wash of brand.' },

    // --- Text & Borders ---
    { path: 'colors.text-primary', widget: 'color', label: 'Text / primary',
      help: 'Default body text — paragraphs, table cells, form values.' },
    { path: 'colors.text-secondary', widget: 'color', label: 'Text / secondary',
      help: 'De-emphasized text — captions, metadata, helper text, placeholders.' },
    { path: 'colors.text-disabled', widget: 'color', label: 'Text / disabled',
      help: 'Text and icon color for disabled buttons, inputs, and menu items.' },
    { path: 'colors.border', widget: 'color', label: 'Border',
      help: 'Hairlines: card borders, table dividers, input borders, divider lines.' },

    // --- Status ---
    { path: 'colors.error', widget: 'color', label: 'Error',
      help: 'Validation errors, destructive actions, error toasts and badges.' },
    { path: 'colors.success', widget: 'color', label: 'Success',
      help: 'Successful state — checkmarks, success toasts, confirmation badges.' },
    { path: 'colors.info', widget: 'color', label: 'Info',
      help: 'Informational alerts and badges — neutral attention.' },
    { path: 'colors.warning', widget: 'color', label: 'Warning',
      help: 'Warning alerts and badges — caution but not destructive.' },
  ],
};
