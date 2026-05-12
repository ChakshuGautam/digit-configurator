import { useMemo } from 'react';
import { useGetList, type Validator } from 'ra-core';

export interface MobileRules {
  pattern: string;
  minLength: number;
  maxLength: number;
  errorMessage: string;
  prefix?: string;
}

// HRMS-side hard minimum. Its DTO has a @Pattern that requires exactly 10
// digits regardless of what MDMS's ValidationConfigs.mobileNumberValidation
// permits. Clamp the effective rules so the form never accepts 9-digit input
// that HRMS will reject downstream.
const HRMS_MIN_LENGTH = 10;

// Kenya default — matches MDMS `ValidationConfigs.mobileNumberValidation`
// at tenant `ke`, tightened to HRMS's 10-digit floor.
const FALLBACK: MobileRules = {
  pattern: '^0?[17][0-9]{8}$',
  minLength: HRMS_MIN_LENGTH,
  maxLength: 10,
  prefix: '+254',
  errorMessage:
    'Enter a 10-digit Kenyan mobile starting with 07 or 01 (e.g. 0712345678)',
};

// Pad a 9-digit Kenyan mobile (`712345678`) with a leading `0` so it becomes
// the 10-digit form HRMS's @Pattern("^[0-9]{10}$") on User.java will accept.
// Both forms are valid Kenyan numbers — the leading-0 form is the local
// presentation convention. Operators copy-paste from contact apps in either
// form; the validator accepts both via FALLBACK's `^0?[17][0-9]{8}$`, but
// HRMS only accepts the padded 10-digit form. Normalising here lets the rest
// of the configurator stay agnostic.
//
// Returns the input unchanged when it doesn't match the 9-digit Kenya shape,
// so non-Kenya inputs and already-padded ones pass through cleanly. The
// MDMS-driven validator decides whether the result is valid — this helper
// only handles the format adapter step.
export function normalizeMobileForHrms(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (/^[17][0-9]{8}$/.test(s)) return '0' + s;
  return s;
}

function parseRules(record: Record<string, unknown> | undefined): MobileRules {
  if (!record) return FALLBACK;
  const raw = record.rules as Record<string, unknown> | undefined;
  if (!raw) return FALLBACK;
  const mdmsMin = typeof raw.minLength === 'number' ? raw.minLength : FALLBACK.minLength;
  const mdmsMax = typeof raw.maxLength === 'number' ? raw.maxLength : FALLBACK.maxLength;
  // Tenant rule allows a shorter form than HRMS's `@Pattern("^[0-9]{10}$")`
  // accepts (e.g. Kenya MDMS says 9 digits, HRMS needs 10). Rather than
  // refusing the MDMS-valid form in the UI, accept both 9- and 10-digit
  // Kenyan formats here and let `normalizeMobileForHrms` pad to 10 at
  // submission time. The validator stays MDMS-aligned, the wire stays
  // HRMS-aligned. Closes the BLOCKER on egovernments/CCRS#484.
  const needsBothForms = mdmsMax < HRMS_MIN_LENGTH;
  return {
    pattern: needsBothForms
      ? FALLBACK.pattern
      : typeof raw.pattern === 'string'
      ? raw.pattern
      : FALLBACK.pattern,
    minLength: mdmsMin,
    maxLength: needsBothForms ? HRMS_MIN_LENGTH : mdmsMax,
    prefix: typeof raw.prefix === 'string' ? raw.prefix : FALLBACK.prefix,
    errorMessage:
      typeof raw.errorMessage === 'string' && raw.errorMessage
        ? raw.errorMessage
        : FALLBACK.errorMessage,
  };
}

export interface UseMobileValidatorResult {
  rules: MobileRules;
  validator: Validator;
  isLoading: boolean;
}

export function useMobileValidator(): UseMobileValidatorResult {
  const { data, isLoading } = useGetList('mobile-validation', {
    pagination: { page: 1, perPage: 20 },
    sort: { field: 'validationName', order: 'ASC' },
  });

  const rules = useMemo<MobileRules>(() => {
    if (!data || data.length === 0) return FALLBACK;
    const preferred =
      data.find(
        (r) =>
          (r as Record<string, unknown>).validationName ===
          'defaultMobileValidation',
      ) ?? data[0];
    return parseRules(preferred as Record<string, unknown>);
  }, [data]);

  const validator = useMemo<Validator>(() => {
    let compiled: RegExp | null = null;
    try {
      compiled = new RegExp(rules.pattern);
    } catch {
      compiled = null;
    }
    const fn: Validator = (value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return 'Required';
      }
      const s = String(value);
      if (s.length < rules.minLength || s.length > rules.maxLength) {
        return rules.errorMessage;
      }
      if (compiled && !compiled.test(s)) {
        return rules.errorMessage;
      }
      return undefined;
    };
    // ra-core `useInput` exposes `isRequired` based on a flag on the
    // validator function — without it the field gets no "*" mark in
    // DigitFormInput. The mobile validator is built dynamically (rules
    // come from MDMS) so we can't compose with `required` upfront via
    // validation.ts's flagRequired; tag the dynamic result here instead.
    // Closes the missing-asterisk point on egovernments/CCRS#484.
    (fn as unknown as { isRequired?: boolean }).isRequired = true;
    return fn;
  }, [rules]);

  return { rules, validator, isLoading };
}
