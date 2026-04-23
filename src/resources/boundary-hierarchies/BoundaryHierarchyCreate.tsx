import { DigitCreate, DigitFormInput, v } from '@/admin';
import { FieldSection } from '@/admin/fields';
import { HierarchyLevelEditor } from './HierarchyLevelEditor';

/** Create a boundary hierarchy on the session tenant. Immutable after
 *  creation — the `boundary-hierarchy-definition` service exposes only
 *  `_search` and `_create`; `_update` / `_delete` both return 400. Surface
 *  a single-shot Create only; do not register Edit or Delete. */
export function BoundaryHierarchyCreate() {
  return (
    <DigitCreate
      title="Create Boundary Hierarchy"
      record={{ boundaryHierarchy: [{ boundaryType: '', parentBoundaryType: null }] }}
    >
      <FieldSection title="Details">
        <DigitFormInput
          source="hierarchyType"
          label="Hierarchy Type"
          validate={v.codeRequired}
          help="Short uppercase identifier, e.g. ADMIN, REVENUE, ELECTION. One per tenant per type."
        />
      </FieldSection>

      <FieldSection title="Levels">
        <HierarchyLevelEditor
          help="First row is the root (no parent). Each subsequent row's parent must reference a boundaryType defined in an earlier row."
        />
      </FieldSection>
    </DigitCreate>
  );
}
