import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetList } from 'ra-core';
import {
  ArrowLeft,
  Download,
  Upload,
  Check,
  X,
  Loader2,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DigitCard } from '@/components/digit/DigitCard';
import { parseExcelFile, parseEmployeeExcel } from '@/utils/excelParser';
import { hrmsService, mdmsService, boundaryService, ApiClientError } from '@/api';
import type {
  EmployeeExcelRow,
  Employee,
  Department,
  Designation,
  Boundary,
} from '@/api/types';
import { useApp } from '../../App';

type Step = 'landing' | 'preview' | 'creating' | 'complete';

interface ParsedEmployee extends EmployeeExcelRow {
  status: 'valid' | 'error';
  error?: string;
}

const TEMPLATE_COLUMNS = [
  'employeeCode',
  'name',
  'userName',
  'mobileNumber',
  'emailId',
  'gender',
  'dob',
  'department',
  'designation',
  'roles',
  'jurisdictions',
  'dateOfAppointment',
];

const TEMPLATE_SAMPLE = {
  employeeCode: 'EMP_001',
  name: 'Jane Kamau',
  userName: '',
  mobileNumber: '0712345678',
  emailId: 'jane.kamau@example.com',
  gender: 'FEMALE',
  dob: '1990-05-14',
  department: 'DEPT_07',
  designation: 'DESIG_1004',
  roles: 'PGR_LME',
  jurisdictions: 'NAIROBI_CITY_VIWANDANI',
  dateOfAppointment: '2026-01-15',
};

function buildTemplateXlsx(
  tenant: string,
  depts: Department[],
  desigs: Designation[],
  boundaries: Boundary[],
  roles: { code: string; name: string }[],
): Blob {
  const wb = XLSX.utils.book_new();

  // Primary sheet — headers + one sample row.
  const primary = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    TEMPLATE_COLUMNS.map((c) => TEMPLATE_SAMPLE[c as keyof typeof TEMPLATE_SAMPLE] ?? ''),
  ]);
  // Hint column widths so operators can read without resizing.
  primary['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, primary, 'Employee');

  // Reference sheet — valid codes in the tenant so operators copy-paste.
  const maxLen = Math.max(
    depts.length,
    desigs.length,
    roles.length,
    boundaries.length,
  );
  const rows: (string | undefined)[][] = [
    ['departments (code : name)', 'designations (code : name)', 'roles (code)', 'boundaries (code : type)'],
  ];
  for (let i = 0; i < maxLen; i += 1) {
    rows.push([
      depts[i] ? `${depts[i].code} : ${depts[i].name}` : '',
      desigs[i] ? `${desigs[i].code} : ${desigs[i].name}` : '',
      roles[i] ? roles[i].code : '',
      boundaries[i] ? `${boundaries[i].code} : ${boundaries[i].boundaryType ?? ''}` : '',
    ]);
  }
  const ref = XLSX.utils.aoa_to_sheet(rows);
  ref['!cols'] = [{ wch: 36 }, { wch: 36 }, { wch: 20 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ref, 'Codes');

  // Tiny instructions page.
  const notes = XLSX.utils.aoa_to_sheet([
    ['Employee bulk import template'],
    [`Tenant: ${tenant}`],
    [''],
    ['Fill rows on the "Employee" sheet. Required columns:'],
    ['  employeeCode  (unique, e.g. EMP_0123)'],
    ['  name          (full display name)'],
    ['  mobileNumber  (10-digit Kenya format, e.g. 0712345678)'],
    ['  dob           (YYYY-MM-DD)'],
    ['  department    (pick a code from the Codes sheet)'],
    ['  designation   (pick a code from the Codes sheet)'],
    [''],
    ['Optional columns:'],
    ['  userName      (auto-derived from name if blank)'],
    ['  emailId'],
    ['  gender        (MALE / FEMALE / TRANSGENDER)'],
    ['  roles         (comma-separated role codes from Codes sheet)'],
    ['  jurisdictions (comma-separated boundary codes)'],
    ['  dateOfAppointment (YYYY-MM-DD, defaults to today)'],
    [''],
    ['Password defaults to eGov@123; employees rotate on first login.'],
  ]);
  notes['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, notes, 'Instructions');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EmployeeBulkImport() {
  const { state } = useApp();
  const navigate = useNavigate();
  const tenantId = state.tenant;

  const [step, setStep] = useState<Step>('landing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string; description?: string }[]>([]);
  const [mobileRules, setMobileRules] = useState<{
    pattern: string;
    minLength: number;
    maxLength: number;
    errorMessage: string;
  } | null>(null);
  const [refsLoading, setRefsLoading] = useState(false);

  // Aggregated boundaries via the resource-registry path (includes sub-tenants).
  const { data: aggregatedBoundaries } = useGetList('boundaries', {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'name', order: 'ASC' },
  });

  useEffect(() => {
    let cancelled = false;
    async function loadRefs() {
      setRefsLoading(true);
      try {
        const [depts, desigs, bounds, fetchedRoles, mobile] = await Promise.all([
          mdmsService.getDepartments(tenantId),
          mdmsService.getDesignations(tenantId),
          boundaryService.searchBoundaries(tenantId),
          mdmsService.getRoles(tenantId).catch(() => [] as typeof roles),
          mdmsService.getMobileValidation(tenantId).catch(() => null),
        ]);
        if (cancelled) return;
        setDepartments(depts);
        setDesignations(desigs);
        setBoundaries(bounds);
        setRoles(fetchedRoles);
        setMobileRules(mobile);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load reference data:', err);
          setError('Failed to load reference data. Templates and validation will be incomplete.');
        }
      } finally {
        if (!cancelled) setRefsLoading(false);
      }
    }
    loadRefs();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Merge the aggregated list from the resource registry (covers sub-tenant
  // boundaries like NAIROBI_CITY at ke.nairobi even if the session is at ke).
  const templateBoundaries = useMemo<Boundary[]>(() => {
    if (!aggregatedBoundaries || aggregatedBoundaries.length === 0) return boundaries;
    const byCode = new Map<string, Boundary>();
    for (const b of boundaries) byCode.set(b.code, b);
    for (const r of aggregatedBoundaries) {
      const rec = r as Record<string, unknown>;
      const code = typeof rec.code === 'string' ? rec.code : String(rec.id ?? '');
      if (!code || byCode.has(code)) continue;
      byCode.set(code, {
        code,
        name: typeof rec.name === 'string' ? rec.name : code,
        boundaryType: typeof rec.boundaryType === 'string' ? rec.boundaryType : '',
        hierarchyType: typeof rec.hierarchyType === 'string' ? rec.hierarchyType : 'ADMIN',
      } as Boundary);
    }
    return Array.from(byCode.values());
  }, [boundaries, aggregatedBoundaries]);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedEmployee[]>([]);

  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [createdCount, setCreatedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [createdEmployees, setCreatedEmployees] = useState<Employee[]>([]);
  const [failures, setFailures] = useState<{ row: ParsedEmployee; error: string }[]>([]);

  const handleTemplateDownload = useCallback(() => {
    const blob = buildTemplateXlsx(tenantId, departments, designations, templateBoundaries, roles);
    triggerDownload(blob, `employees-template-${tenantId}.xlsx`);
  }, [tenantId, departments, designations, templateBoundaries, roles]);

  const validateRows = useCallback(
    (raw: EmployeeExcelRow[]): ParsedEmployee[] => {
      const deptCodes = new Set(departments.map((d) => d.code));
      const desigCodes = new Set(designations.map((d) => d.code));
      const boundaryCodes = new Set(templateBoundaries.map((b) => b.code));
      const validRoles = new Set(roles.map((r) => r.code));

      let compiledMobile: RegExp | null = null;
      if (mobileRules) {
        try { compiledMobile = new RegExp(mobileRules.pattern); } catch { compiledMobile = null; }
      }

      return raw.map((emp) => {
        const errors: string[] = [];

        if (emp.department && !deptCodes.has(emp.department)) {
          errors.push(`Department "${emp.department}" not found`);
        }
        if (emp.designation && !desigCodes.has(emp.designation)) {
          errors.push(`Designation "${emp.designation}" not found`);
        }

        if (emp.roles) {
          for (const r of emp.roles.split(',').map((s) => s.trim()).filter(Boolean)) {
            if (!validRoles.has(r)) errors.push(`Role "${r}" not valid`);
          }
        }

        if (emp.jurisdictions) {
          for (const b of emp.jurisdictions.split(',').map((s) => s.trim()).filter(Boolean)) {
            if (!boundaryCodes.has(b)) errors.push(`Boundary "${b}" not found`);
          }
        }

        if (emp.mobileNumber) {
          const len = emp.mobileNumber.length;
          const effMin = Math.max(mobileRules?.minLength ?? 10, 10);
          const effMax = mobileRules?.maxLength ?? 10;
          if (len < effMin || len > effMax || (compiledMobile && !compiledMobile.test(emp.mobileNumber))) {
            errors.push(
              mobileRules?.errorMessage ?? 'Mobile number must be 10 digits starting with 07 or 01',
            );
          }
        }

        if (!emp.dob || !/^\d{4}-\d{2}-\d{2}$/.test(emp.dob)) {
          errors.push('Date of birth missing or malformed (expected YYYY-MM-DD)');
        }

        return {
          ...emp,
          status: errors.length === 0 ? 'valid' : 'error',
          error: errors.length > 0 ? errors.join('; ') : undefined,
        };
      });
    },
    [departments, designations, templateBoundaries, roles, mobileRules],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const workbook = await parseExcelFile(file);
        const result = parseEmployeeExcel(workbook);
        if (result.data.length === 0) {
          // Parser returned nothing — surface the first parse error if present.
          const msg =
            result.validation.errors[0]?.message ||
            'No employee rows found. Check the sheet is named "Employee".';
          setError(msg);
          return;
        }
        const validated = validateRows(result.data);
        setRows(validated);
        setUploadedFile(file);
        setStep('preview');
      } catch (err) {
        console.error('Excel parse error', err);
        setError('Failed to parse file. Please upload a valid .xlsx, .xls, or .csv.');
      } finally {
        setLoading(false);
      }
    },
    [validateRows],
  );

  const handleCreate = useCallback(async () => {
    setStep('creating');
    setProgress(0);
    setCreatedCount(0);
    setFailedCount(0);
    setCreatedEmployees([]);
    setFailures([]);

    const valid = rows.filter((r) => r.status === 'valid');
    const failuresAcc: { row: ParsedEmployee; error: string }[] = [];
    const createdAcc: Employee[] = [];

    for (let i = 0; i < valid.length; i += 1) {
      const emp = valid[i];
      setProgressMsg(`Creating ${emp.name}...`);

      try {
        const empRoles = emp.roles
          ? emp.roles.split(',').map((r) => {
              const r2 = r.trim();
              const def = roles.find((pr) => pr.code === r2);
              return { code: r2, name: def?.name || r2 };
            })
          : [{ code: 'EMPLOYEE', name: 'Employee' }];

        const jurisdictions = emp.jurisdictions
          ? emp.jurisdictions.split(',').map((b) => {
              const code = b.trim();
              const bnd = templateBoundaries.find((x) => x.code === code);
              return {
                boundary: code,
                boundaryType: bnd?.boundaryType ?? 'Ward',
                hierarchyType: bnd?.hierarchyType ?? 'ADMIN',
              };
            })
          : [];

        const built = hrmsService.buildEmployee({
          tenantId,
          code: emp.employeeCode || hrmsService.generateEmployeeCode('EMP', i + 1),
          name: emp.name,
          userName: (emp.userName && emp.userName.trim()) || hrmsService.generateUsername(emp.name),
          mobileNumber: emp.mobileNumber,
          emailId: emp.emailId,
          gender: emp.gender,
          dob: new Date(emp.dob).getTime(),
          department: emp.department,
          designation: emp.designation,
          roles: empRoles,
          jurisdictions,
          dateOfAppointment: emp.dateOfAppointment
            ? new Date(emp.dateOfAppointment).getTime()
            : undefined,
        });

        const created = await hrmsService.createEmployee(built);
        createdAcc.push(created);
        setCreatedEmployees((prev) => [...prev, created]);
        setCreatedCount((prev) => prev + 1);
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.firstError
            : err instanceof Error
            ? err.message
            : 'Unknown error';
        failuresAcc.push({ row: emp, error: msg });
        setFailures((prev) => [...prev, { row: emp, error: msg }]);
        setFailedCount((prev) => prev + 1);
      }

      setProgress(Math.round(((i + 1) / valid.length) * 100));
    }

    setStep('complete');
    void createdAcc;
    void failuresAcc;
  }, [rows, roles, templateBoundaries, tenantId]);

  const handleDownloadCreds = useCallback(() => {
    const rowsOut = [['Name', 'Username', 'Mobile', 'Password']];
    for (const emp of createdEmployees) {
      rowsOut.push([
        emp.user.name,
        emp.user.userName,
        emp.user.mobileNumber,
        'eGov@123',
      ]);
    }
    const csv = rowsOut.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    triggerDownload(blob, `employee-credentials-${tenantId}.csv`);
  }, [createdEmployees, tenantId]);

  const validCount = rows.filter((r) => r.status === 'valid').length;
  const errorCount = rows.length - validCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/manage/employees')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back to employees
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold font-condensed text-foreground">
          Bulk import employees
        </h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="shrink-0 hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </AlertDescription>
        </Alert>
      )}

      {step === 'landing' && (
        <DigitCard className="max-w-none">
          <div className="space-y-6">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Tenant: <span className="font-mono">{tenantId}</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <RefCount label="Departments" value={departments.length} loading={refsLoading} />
                <RefCount label="Designations" value={designations.length} loading={refsLoading} />
                <RefCount label="Roles" value={roles.length} loading={refsLoading} />
                <RefCount label="Boundaries" value={templateBoundaries.length} loading={refsLoading} />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Step 1 · Download template
              </h2>
              <p className="text-sm text-muted-foreground">
                The template includes an <span className="font-mono">Employee</span> sheet for data, a{' '}
                <span className="font-mono">Codes</span> sheet listing valid department / designation / role
                / boundary codes, and an <span className="font-mono">Instructions</span> sheet.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleTemplateDownload}
                disabled={refsLoading}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download template
              </Button>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Step 2 · Upload filled file
              </h2>
              <label
                htmlFor="employee-bulk-file"
                className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <p className="text-sm">Parsing…</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-primary" />
                    <p className="text-sm font-medium">Drop .xlsx / .xls / .csv here, or click to browse</p>
                    <p className="text-xs text-muted-foreground">First sheet must be named "Employee"</p>
                  </>
                )}
                <input
                  id="employee-bulk-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </DigitCard>
      )}

      {step === 'preview' && (
        <DigitCard className="max-w-none">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium truncate">{uploadedFile?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Total: {rows.length}</span>
                <Badge className="bg-success text-white">{validCount} valid</Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} with errors</Badge>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[800px] sm:min-w-0 px-4 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Roles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((r, i) => (
                      <TableRow key={i} className={r.status === 'error' ? 'bg-destructive/10' : ''}>
                        <TableCell>
                          {r.status === 'valid' ? (
                            <Badge className="gap-1 bg-success text-white">
                              <Check className="w-3 h-3" /> Valid
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1" title={r.error}>
                              <AlertTriangle className="w-3 h-3" /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{r.name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                        <TableCell className="font-mono text-sm">{r.mobileNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{r.dob}</TableCell>
                        <TableCell className="text-xs">{r.department}</TableCell>
                        <TableCell className="text-xs">{r.designation}</TableCell>
                        <TableCell className="text-xs">{r.roles}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 50 of {rows.length} rows
                  </p>
                )}
              </div>
            </div>

            {errorCount > 0 && (
              <Alert variant="warning">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  <p className="font-medium mb-1">{errorCount} row(s) will be skipped:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {rows
                      .filter((r) => r.status === 'error')
                      .slice(0, 5)
                      .map((r, i) => (
                        <li key={i}>
                          <span className="font-medium">{r.name || r.employeeCode}</span>: {r.error}
                        </li>
                      ))}
                    {errorCount > 5 && <li>…and {errorCount - 5} more</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <Button variant="outline" onClick={() => setStep('landing')} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Upload a different file
              </Button>
              <Button onClick={handleCreate} disabled={validCount === 0} className="gap-1.5">
                Create {validCount} employees
              </Button>
            </div>
          </div>
        </DigitCard>
      )}

      {step === 'creating' && (
        <DigitCard className="max-w-none">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{progressMsg || 'Preparing…'}</span>
              <span className="text-primary font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              {createdCount} created
              {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
              {' · '}
              {validCount} total
            </p>
          </div>
        </DigitCard>
      )}

      {step === 'complete' && (
        <DigitCard className="max-w-none">
          <div className="space-y-4">
            <div
              className={`rounded-md border p-4 ${
                failedCount === 0
                  ? 'bg-success/10 border-success/30'
                  : 'bg-warning/10 border-warning/30'
              }`}
            >
              <p className="font-semibold">
                {failedCount === 0
                  ? `Created ${createdCount} employees`
                  : `Created ${createdCount}, ${failedCount} failed`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {errorCount > 0 && `${errorCount} row(s) skipped for validation errors. `}
                Tenant: <span className="font-mono">{tenantId}</span>
              </p>
            </div>

            {failures.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failures.slice(0, 20).map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{f.row.name}</TableCell>
                        <TableCell className="font-mono text-xs">{f.row.employeeCode}</TableCell>
                        <TableCell className="font-mono text-xs">{f.row.mobileNumber}</TableCell>
                        <TableCell className="text-sm text-destructive">{f.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {failures.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 20 of {failures.length} failures
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <Button
                variant="outline"
                onClick={handleDownloadCreds}
                disabled={createdEmployees.length === 0}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download credentials CSV
              </Button>
              <Button onClick={() => navigate('/manage/employees')} className="gap-1.5">
                Back to employees
              </Button>
            </div>
          </div>
        </DigitCard>
      )}
    </div>
  );
}

function RefCount({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">
        {loading ? <span className="text-muted-foreground">…</span> : value}
      </div>
    </div>
  );
}
