import { DigitCreate, DigitFormCodeInput, DigitFormInput, DigitFormSelect, v } from '@/admin';
import { FieldSection } from '@/admin/fields';
import { DEFAULT_PASSWORD } from '@/api/config';
import { useMobileValidator } from '@/admin/hrms/useMobileValidator';
import { useApp } from '../../App';
import { RolesEditor } from './RolesEditor';
import { JurisdictionEditor } from './JurisdictionEditor';
import { AssignmentEditor } from './AssignmentEditor';

const GENDER_CHOICES = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'TRANSGENDER', label: 'Transgender' },
];

const STATUS_CHOICES = [
  { value: 'EMPLOYED', label: 'Employed' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'RETIRED', label: 'Retired' },
];

const TYPE_CHOICES = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'TEMPORARY', label: 'Temporary' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'DEPUTATION', label: 'Deputation' },
];

function deriveUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value) {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

export function EmployeeCreate() {
  const { state } = useApp();
  const tenantId = state.tenant;
  const { validator: mobileValidate, rules: mobileRules } = useMobileValidator();

  const defaults = {
    tenantId,
    employeeType: 'PERMANENT',
    employeeStatus: 'EMPLOYED',
    user: {
      type: 'EMPLOYEE',
      active: true,
      gender: 'MALE',
      password: DEFAULT_PASSWORD,
      tenantId,
      roles: [],
    },
    jurisdictions: [],
    assignments: [],
  };

  const transform = (data: Record<string, unknown>): Record<string, unknown> => {
    const userInput = (data.user as Record<string, unknown> | undefined) ?? {};
    const name = typeof userInput.name === 'string' ? userInput.name.trim() : '';
    const userName =
      typeof userInput.userName === 'string' && userInput.userName.trim()
        ? userInput.userName.trim().toLowerCase()
        : deriveUsername(name);
    const user = {
      ...userInput,
      userName,
      tenantId,
      type: 'EMPLOYEE',
      active: true,
      password: typeof userInput.password === 'string' && userInput.password ? userInput.password : DEFAULT_PASSWORD,
      dob: toEpochMs(userInput.dob),
    };

    const doa = toEpochMs(data.dateOfAppointment) ?? Date.now();

    return {
      ...data,
      tenantId,
      dateOfAppointment: doa,
      user,
    };
  };

  return (
    <DigitCreate title="Create Employee" record={defaults} transform={transform}>
      <FieldSection title="Tenant">
        <DigitFormSelect
          source="tenantId"
          label="Tenant"
          reference="tenants"
          optionValue="code"
          optionText="code"
          validate={v.codeRequired}
          placeholder="Select tenant"
          help="Employee is created on this tenant — must match the login subdomain (e.g. ke.nairobi)."
        />
      </FieldSection>

      <FieldSection title="Employee Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DigitFormInput source="user.name" label="Name" validate={v.name} />
          <DigitFormCodeInput
            source="code"
            label="Employee Code"
            deriveFrom="user.name"
            validate={v.codeRequired}
          />
          <DigitFormInput
            source="user.mobileNumber"
            label="Mobile Number"
            validate={mobileValidate}
            help={mobileRules.errorMessage}
          />
          <DigitFormInput
            source="user.userName"
            label="Username"
            help="Auto-generated from name if left blank"
          />
          <DigitFormInput source="user.emailId" label="Email" type="email" validate={v.emailOptional} />
          <DigitFormInput source="user.dob" label="Date of Birth" type="date" validate={v.required} />
          <DigitFormSelect
            source="user.gender"
            label="Gender"
            choices={GENDER_CHOICES}
            placeholder="Select gender..."
          />
          <DigitFormInput source="dateOfAppointment" label="Date of Appointment" type="date" />
          <DigitFormSelect
            source="employeeStatus"
            label="Employee Status"
            choices={STATUS_CHOICES}
            placeholder="Select status..."
          />
          <DigitFormSelect
            source="employeeType"
            label="Employee Type"
            choices={TYPE_CHOICES}
            placeholder="Select type..."
          />
        </div>
      </FieldSection>

      <FieldSection title="Roles">
        <RolesEditor tenantId={tenantId} help="Pick one or more. GRO, DGRO, PGR_LME, CSR are typical for PGR." />
      </FieldSection>

      <FieldSection title="Assignments">
        <AssignmentEditor help="At least one assignment must be marked current." />
      </FieldSection>

      <FieldSection title="Jurisdictions">
        <JurisdictionEditor tenantId={tenantId} help="Areas this employee is responsible for." />
      </FieldSection>

      <FieldSection title="Account Password">
        <DigitFormInput
          source="user.password"
          label="Initial Password"
          help="Defaults to eGov@123. Employee should rotate on first login."
        />
      </FieldSection>
    </DigitCreate>
  );
}
