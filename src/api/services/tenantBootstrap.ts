// Tenant bootstrap — register a brand-new state root so the wizard's Phase 2-4
// writes (which target the new tenant) can find the schemas + role records they need.
//
// Mirrors DIGIT-MCP's `tenant_bootstrap` tool (src/tools/mdms-tenant.ts:837). Runs
// inline in the SPA for now; a follow-up can refactor to call MCP over HTTP once
// MCP is part of personal-install's compose.
//
// Two tenants in play, never three:
//   - operator (auth identity from session token — typically ADMIN@pg with SUPERUSER)
//   - target (the new state root being bootstrapped — derived from the wizard's new tenant code)
//
// The ~14 essential data schemas + role registrations are required because:
//   - egov-user validates assigned role codes against ACCESSCONTROL-ROLES.roles at the
//     user's tenant before creating an employee (INVALID_ROLE otherwise).
//   - egov-mdms-v2 rejects every _create with SCHEMA_DEFINITION_NOT_FOUND_ERR if the
//     target tenant has no schema definitions of its own (no parent fallback on _create).
//   - inbox + PGR's @PostConstruct init reads DataSecurity.* policies at startup; missing
//     records crash the services. Bootstrap seeds them so wizard Phase 3-4 writes proceed.

import { apiClient } from '../client';
import { ENDPOINTS } from '../config';
import { DEFAULT_PASSWORD } from '../config';

interface SchemaDefinition {
  code: string;
  description?: string;
  definition: Record<string, unknown>;
  isActive?: boolean;
}

interface MdmsRecordRaw {
  tenantId: string;
  schemaCode: string;
  uniqueIdentifier: string;
  data: Record<string, unknown>;
  isActive?: boolean;
}

export interface BootstrapResult {
  schemas: { copied: string[]; skipped: string[]; failed: string[] };
  data: { copied: string[]; skipped: string[]; failed: string[] };
  admin: { created: boolean; tenantId: string } | null;
  workflow: { copied: string[]; failed: string[] };
}

export interface BootstrapProgress {
  step: 'schemas' | 'self-record' | 'data' | 'admin' | 'workflow';
  current: number;
  total: number;
  detail?: string;
}

// Schemas whose data the wizard needs at the new tenant root for Phase 2-4 to work.
// Order matters: ACCESSCONTROL-ROLES.roles must be in place before any user create.
// DataSecurity.* must be in place before inbox/PGR/user services accept writes targeting
// the new tenant (their @PostConstruct init evaluates these).
const ESSENTIAL_DATA_SCHEMAS = [
  'ACCESSCONTROL-ROLES.roles',
  'common-masters.IdFormat',
  'common-masters.Department',
  'DataSecurity.DecryptionABAC',
  'DataSecurity.EncryptionPolicy',
  'DataSecurity.SecurityPolicy',
  'DataSecurity.MaskingPatterns',
  'common-masters.Designation',
  'common-masters.StateInfo',
  'common-masters.GenderType',
  'egov-hrms.EmployeeStatus',
  'egov-hrms.EmployeeType',
  'egov-hrms.DeactivationReason',
  'RAINMAKER-PGR.ServiceDefs',
  'Workflow.BusinessService',
  'INBOX.InboxQueryConfiguration',
];

// Roles the new state's ADMIN user needs. INTERNAL_MICROSERVICE_ROLE is non-negotiable —
// inbox crashes at startup if no user has it on the state tenant.
const ADMIN_ROLES = [
  { code: 'EMPLOYEE', name: 'Employee' },
  { code: 'CITIZEN', name: 'Citizen' },
  { code: 'CSR', name: 'CSR' },
  { code: 'GRO', name: 'Grievance Routing Officer' },
  { code: 'PGR_LME', name: 'PGR Last Mile Employee' },
  { code: 'DGRO', name: 'Department GRO' },
  { code: 'SUPERUSER', name: 'Super User' },
  { code: 'INTERNAL_MICROSERVICE_ROLE', name: 'Internal Microservice Role' },
];

const isDuplicateError = (msg: string): boolean =>
  /duplicate|already exists|unique|NON_UNIQUE/i.test(msg);

// --- Step 0: detection ---------------------------------------------------

/** True iff the state root has zero schemas registered. If so, wizard must bootstrap. */
export async function stateNeedsBootstrap(stateRoot: string): Promise<boolean> {
  try {
    const response = await apiClient.post(ENDPOINTS.MDMS_SCHEMA_SEARCH, {
      RequestInfo: apiClient.buildRequestInfo(),
      SchemaDefCriteria: { tenantId: stateRoot, limit: 1 },
    });
    const schemas = (response.SchemaDefinitions || []) as SchemaDefinition[];
    return schemas.length === 0;
  } catch {
    // Treat any error as "needs bootstrap" — better to over-attempt than under-attempt;
    // duplicate handling makes re-running idempotent anyway.
    return true;
  }
}

// --- Step 1: schema clone ------------------------------------------------

async function searchSchemas(tenantId: string): Promise<SchemaDefinition[]> {
  const response = await apiClient.post(ENDPOINTS.MDMS_SCHEMA_SEARCH, {
    RequestInfo: apiClient.buildRequestInfo(),
    SchemaDefCriteria: { tenantId, limit: 500 },
  });
  return (response.SchemaDefinitions || []) as SchemaDefinition[];
}

async function createSchema(tenantId: string, schema: SchemaDefinition): Promise<void> {
  await apiClient.post(ENDPOINTS.MDMS_SCHEMA_CREATE, {
    RequestInfo: apiClient.buildRequestInfo(),
    SchemaDefinition: {
      tenantId,
      code: schema.code,
      description: schema.description || schema.code,
      definition: schema.definition,
      isActive: true,
    },
  });
}

// --- Step 3: essential data copy ----------------------------------------

async function searchData(tenantId: string, schemaCode: string): Promise<MdmsRecordRaw[]> {
  const response = await apiClient.post(ENDPOINTS.MDMS_SEARCH, {
    RequestInfo: apiClient.buildRequestInfo(),
    MdmsCriteria: { tenantId, schemaCode, limit: 500 },
  });
  return (response.mdms || []) as MdmsRecordRaw[];
}

async function createData(record: MdmsRecordRaw): Promise<void> {
  await apiClient.post(`${ENDPOINTS.MDMS_CREATE}/${record.schemaCode}`, {
    RequestInfo: apiClient.buildRequestInfo(),
    Mdms: {
      tenantId: record.tenantId,
      schemaCode: record.schemaCode,
      uniqueIdentifier: record.uniqueIdentifier,
      data: record.data,
      isActive: true,
    },
  });
}

// --- Step 4: ADMIN user at new tenant -----------------------------------

async function provisionAdmin(target: string): Promise<{ uuid: string } | null> {
  // userName uniqueness is per-tenant; the same "ADMIN" name can coexist across tenants.
  const payload = {
    RequestInfo: apiClient.buildRequestInfo(),
    user: {
      name: 'Admin',
      userName: 'ADMIN',
      password: DEFAULT_PASSWORD,
      mobileNumber: '9999999999',
      emailId: 'admin@digit.org',
      tenantId: target,
      type: 'EMPLOYEE',
      active: true,
      roles: ADMIN_ROLES.map((r) => ({ ...r, tenantId: target })),
    },
  };
  const response = await apiClient.post(ENDPOINTS.USER_CREATE, payload);
  const user = (response.user as Array<{ uuid: string }> | undefined)?.[0];
  return user ? { uuid: user.uuid } : null;
}

// --- Step 5: workflow PGR copy ------------------------------------------

interface WorkflowBusinessService {
  tenantId: string;
  businessService: string;
  business: string;
  businessServiceSla: number;
  states: unknown[];
}

async function workflowCopyPGR(source: string, target: string): Promise<string[]> {
  // Source workflow lives at a city tenant (typically pg.citya). Fall back to searching
  // at the source state root if the city-specific search returns nothing.
  const searchAtCity = `${source}.citya`;
  let response = await apiClient.post(
    `${ENDPOINTS.WORKFLOW_BS_SEARCH}?tenantId=${searchAtCity}&businessServices=PGR`,
    { RequestInfo: apiClient.buildRequestInfo() }
  );
  let services = (response.BusinessServices || []) as WorkflowBusinessService[];
  if (services.length === 0) {
    response = await apiClient.post(
      `${ENDPOINTS.WORKFLOW_BS_SEARCH}?tenantId=${source}&businessServices=PGR`,
      { RequestInfo: apiClient.buildRequestInfo() }
    );
    services = (response.BusinessServices || []) as WorkflowBusinessService[];
  }
  if (services.length === 0) return [];

  // Strip server-assigned fields, rebind to target tenant
  const cleaned = services.map((svc) => ({
    ...svc,
    tenantId: target,
    states: stripIds(svc.states),
  }));

  await apiClient.post(`${ENDPOINTS.WORKFLOW_BS_CREATE}?tenantId=${target}`, {
    RequestInfo: apiClient.buildRequestInfo(),
    BusinessServices: cleaned,
  });
  return cleaned.map((s) => s.businessService);
}

// Recursively strip uuid/auditDetails/currentState-by-uuid so workflow create accepts the payload
function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'uuid' || k === 'auditDetails' || k === 'businessServiceId' || k === 'currentState') continue;
      out[k] = stripIds(v);
    }
    return out;
  }
  return value;
}

// --- Top-level orchestration --------------------------------------------

export async function bootstrapStateRoot(
  target: string,
  options: { source?: string; onProgress?: (p: BootstrapProgress) => void } = {}
): Promise<BootstrapResult> {
  const source = options.source || 'pg';
  const onProgress = options.onProgress || (() => undefined);

  const result: BootstrapResult = {
    schemas: { copied: [], skipped: [], failed: [] },
    data: { copied: [], skipped: [], failed: [] },
    admin: null,
    workflow: { copied: [], failed: [] },
  };

  // Step 1: schemas
  const sourceSchemas = await searchSchemas(source);
  onProgress({ step: 'schemas', current: 0, total: sourceSchemas.length });
  for (let i = 0; i < sourceSchemas.length; i++) {
    const schema = sourceSchemas[i];
    try {
      await createSchema(target, schema);
      result.schemas.copied.push(schema.code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isDuplicateError(msg)) result.schemas.skipped.push(schema.code);
      else result.schemas.failed.push(`${schema.code}: ${msg}`);
    }
    onProgress({ step: 'schemas', current: i + 1, total: sourceSchemas.length, detail: schema.code });
  }

  // Step 2: self-record (tenant.tenants/<target> at <target>)
  onProgress({ step: 'self-record', current: 0, total: 1 });
  try {
    await createData({
      tenantId: target,
      schemaCode: 'tenant.tenants',
      uniqueIdentifier: target,
      data: {
        code: target,
        name: target,
        description: `State tenant root: ${target}`,
        city: {
          code: target.toUpperCase(),
          name: target,
          districtCode: target.toUpperCase(),
          districtName: target,
        },
      },
    });
    result.data.copied.push(`tenant.tenants/${target} (self-record)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isDuplicateError(msg)) result.data.skipped.push(`tenant.tenants/${target}`);
    else result.data.failed.push(`tenant.tenants/${target}: ${msg}`);
  }
  onProgress({ step: 'self-record', current: 1, total: 1 });

  // Step 3: essential data
  onProgress({ step: 'data', current: 0, total: ESSENTIAL_DATA_SCHEMAS.length });
  for (let i = 0; i < ESSENTIAL_DATA_SCHEMAS.length; i++) {
    const schemaCode = ESSENTIAL_DATA_SCHEMAS[i];
    try {
      const records = await searchData(source, schemaCode);
      for (const record of records) {
        try {
          await createData({ ...record, tenantId: target });
          result.data.copied.push(`${schemaCode}/${record.uniqueIdentifier}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isDuplicateError(msg)) result.data.skipped.push(`${schemaCode}/${record.uniqueIdentifier}`);
          else result.data.failed.push(`${schemaCode}/${record.uniqueIdentifier}: ${msg}`);
        }
      }
    } catch (err) {
      // Schema absent at source — non-fatal
      result.data.skipped.push(`${schemaCode} (not at source)`);
    }
    onProgress({ step: 'data', current: i + 1, total: ESSENTIAL_DATA_SCHEMAS.length, detail: schemaCode });
  }

  // Step 4: ADMIN user
  onProgress({ step: 'admin', current: 0, total: 1 });
  try {
    result.admin = await provisionAdmin(target).then((u) =>
      u ? { created: true, tenantId: target } : null
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isDuplicateError(msg)) {
      console.warn(`[bootstrap] ADMIN provision at ${target} failed: ${msg}`);
    }
  }
  onProgress({ step: 'admin', current: 1, total: 1 });

  // Step 5: workflow PGR copy
  onProgress({ step: 'workflow', current: 0, total: 1 });
  try {
    const copied = await workflowCopyPGR(source, target);
    result.workflow.copied = copied;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isDuplicateError(msg)) result.workflow.failed.push(`PGR: ${msg}`);
  }
  onProgress({ step: 'workflow', current: 1, total: 1 });

  return result;
}
