import { createContext, useContext, useRef, useCallback, type RefObject } from 'react';

/**
 * DOM-level hover highlight for the theme preview.
 *
 * Why DOM-level and not React state: hovering 38 color fields in quick
 * succession would trigger 38 re-renders of ThemePreview (and its `useWatch`
 * child). Instead, we mutate a single attribute on the preview root and let
 * a short imperative pass toggle a class on matching `[data-token]` elements.
 * Zero React re-renders, no context value churn.
 */
export interface HoverContextValue {
  previewRootRef: RefObject<HTMLDivElement | null>;
  setHoveredToken: (token: string | null) => void;
}

const HIGHLIGHT_CLASS = 'theme-token-hover';

/**
 * v2 semantic key → list of v1 paths it fans out to. Mirrors the
 * SEMANTIC_EXPANSION map in theflywheel/digit-ui-esbuild's applyTheme.js
 * and the V2_TO_V1_FALLBACK map in ThemePreview. Kept here so a hover on a
 * v2 form input lights up every v1 [data-token] element it ultimately drives.
 *
 * Keys are without the `colors.` prefix; the matcher adds it back.
 */
const V2_TO_V1: Record<string, string[]> = {
  brand: ['primary.main'],
  'brand-on': ['primary.dark', 'primary.accent', 'link.normal', 'link.hover', 'text.heading'],
  'surface-header': ['secondary', 'digitv2.header-sidenav'],
  'surface-page': ['grey.light'],
  'text-primary': ['text.primary'],
  'text-secondary': ['text.secondary', 'text.muted'],
  'text-disabled': ['grey.disabled', 'digitv2.text-color-disabled'],
  border: ['border', 'input-border'],
  error: ['error', 'error-dark'],
  success: ['success'],
  info: ['digitv2.alert-info', 'info-dark'],
  warning: ['warning-dark'],
  'selected-bg': ['primary.selected-bg', 'digitv2.primary-bg'],
};

/** Tokens to look for given a hovered form field path. For a v2 form input
 *  (`colors.brand`), returns the v2 path itself plus every v1 path the v2 key
 *  expands to. For a legacy v1 path or any non-v2 token, returns it unchanged. */
function expandTokenForMatching(token: string): string[] {
  const v2Key = token.startsWith('colors.') ? token.slice('colors.'.length) : token;
  const v1Paths = V2_TO_V1[v2Key];
  if (!v1Paths) return [token];
  return [token, ...v1Paths.map((p) => `colors.${p}`)];
}

const HoverContext = createContext<HoverContextValue | null>(null);

export function useHoverContext(): HoverContextValue | null {
  return useContext(HoverContext);
}

export { HoverContext };

/** Creates the setter paired with a ref to the preview root. Call once at
 *  the editor level and pass the pair down via context. */
export function useCreateHoverContext(): HoverContextValue {
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const lastSelectorRef = useRef<string | null>(null);

  const setHoveredToken = useCallback((token: string | null) => {
    const root = previewRootRef.current;
    if (!root) return;
    // Clear previous highlights.
    if (lastSelectorRef.current) {
      root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
        el.classList.remove(HIGHLIGHT_CLASS);
      });
      lastSelectorRef.current = null;
    }
    if (!token) return;
    // CSS attribute selectors can't have escaped commas / colons without quoting,
    // so we filter by exact match against the full token path stored on data-token.
    // Multiple tokens on one element are space-separated (e.g. "colors.border colors.input-border").
    // For a v2 input (e.g. colors.brand), we also light up any element whose
    // data-token contains the v1 paths brand fans out into (colors.primary.main, …).
    const candidates = expandTokenForMatching(token);
    const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-token]'))
      .filter((el) => {
        const list = el.dataset.token?.split(/\s+/) ?? [];
        return candidates.some((c) => list.includes(c));
      });
    matches.forEach((el) => el.classList.add(HIGHLIGHT_CLASS));
    lastSelectorRef.current = token;
  }, []);

  return { previewRootRef, setHoveredToken };
}

export const HIGHLIGHT_CLASS_NAME = HIGHLIGHT_CLASS;
