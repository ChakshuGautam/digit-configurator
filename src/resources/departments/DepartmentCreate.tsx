import { DigitCreate, DigitFormCodeInput, DigitFormInput, v } from '@/admin';
import { BooleanInput } from '@/admin/widgets';

export function DepartmentCreate() {
  return (
    <DigitCreate title="Create Department" record={{ active: true }}>
      <DigitFormInput source="name" label="Name" validate={v.name} />
      <DigitFormCodeInput source="code" label="Code" deriveFrom="name" validate={v.codeRequired} />
      <DigitFormInput source="description" label="Description" />
      <BooleanInput source="active" label="Active" />
    </DigitCreate>
  );
}
