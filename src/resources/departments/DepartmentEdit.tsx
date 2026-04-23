import { DigitEdit, DigitFormInput, v } from '@/admin';
import { BooleanInput } from '@/admin/widgets';

export function DepartmentEdit() {
  return (
    <DigitEdit title="Edit Department">
      <DigitFormInput source="code" label="Code" disabled />
      <DigitFormInput source="name" label="Name" validate={v.name} />
      <DigitFormInput source="description" label="Description" />
      <BooleanInput source="active" label="Active" />
    </DigitEdit>
  );
}
