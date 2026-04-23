import { DigitEdit, DigitFormInput, v } from '@/admin';
import { BooleanInput } from '@/admin/widgets';
import { DepartmentChipInput } from './DepartmentChipInput';

export function DesignationEdit() {
  return (
    <DigitEdit title="Edit Designation">
      <DigitFormInput source="code" label="Code" disabled />
      <DigitFormInput source="name" label="Name" validate={v.name} />
      <DigitFormInput source="description" label="Description" validate={v.required} />
      <DepartmentChipInput
        source="department"
        label="Departments"
        help="This designation can belong to multiple departments."
      />
      <BooleanInput source="active" label="Active" />
    </DigitEdit>
  );
}
