import type { SchemaDescriptor } from './types';
import { userValidationDescriptor } from './user-validation';

/** Map of schema code -> descriptor. Add new entries as we cover more schemas. */
const DESCRIPTORS: Record<string, SchemaDescriptor> = {
  [userValidationDescriptor.schema]: userValidationDescriptor,
};

export function getDescriptor(schemaCode?: string): SchemaDescriptor | undefined {
  if (!schemaCode) return undefined;
  return DESCRIPTORS[schemaCode];
}

export function getFieldSpec(descriptor: SchemaDescriptor | undefined, path: string) {
  return descriptor?.fields.find((f) => f.path === path);
}

export type { SchemaDescriptor, FieldSpec, FieldGroup, WidgetKind } from './types';
