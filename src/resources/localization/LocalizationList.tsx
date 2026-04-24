import { useListContext } from 'ra-core';
import { DigitList, DigitDatagrid } from '@/admin';
import type { DigitColumn } from '@/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Locales offered in the column dropdowns. Curated set rather than every
 * BCP-47 tag — live DIGIT-UI deployments use these three (en_IN baseline,
 * sw_KE for the Kenya pilot, hi_IN for India). Extend as needed.
 */
const LOCALE_OPTIONS = [
  { value: 'en_IN', label: 'English (en_IN)' },
  { value: 'sw_KE', label: 'Swahili (sw_KE)' },
  { value: 'hi_IN', label: 'Hindi (hi_IN)' },
];

const labelFor = (code: string) =>
  LOCALE_OPTIONS.find((o) => o.value === code)?.label ?? code;

const truncate = (s: unknown) => {
  const t = String(s ?? '');
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
};

/** Two-locale picker rendered above the datagrid. Writes to the list filter
 *  state — the data provider reads `locale` (left col) + `locale2` (right
 *  col) and pivots both into one row per (code, module). */
function LocaleSelector() {
  const { filterValues, setFilters } = useListContext();
  const localeA = String(filterValues.locale || 'en_IN');
  const localeB = String(filterValues.locale2 || 'sw_KE');
  const update = (key: 'locale' | 'locale2') => (v: string) =>
    setFilters({ ...filterValues, [key]: v }, undefined, true);

  return (
    <div className="flex items-center gap-3 mb-3 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground">Compare locales:</span>
      <Select value={localeA} onValueChange={update('locale')}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LOCALE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">vs</span>
      <Select value={localeB} onValueChange={update('locale2')}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LOCALE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {localeA === localeB && (
        <span className="text-xs text-warning-dark">Same locale on both sides — pick different ones to compare.</span>
      )}
    </div>
  );
}

/** Datagrid with column labels driven by the locale dropdowns. Rendered
 *  inside DigitList so it shares the ListContextProvider with the selector. */
function PivotDatagrid() {
  const { filterValues } = useListContext();
  const localeA = String(filterValues.locale || 'en_IN');
  const localeB = String(filterValues.locale2 || 'sw_KE');

  const columns: DigitColumn[] = [
    { source: 'code', label: 'app.fields.code' },
    { source: 'module', label: 'app.fields.module' },
    {
      source: 'message',
      label: `Message · ${labelFor(localeA)}`,
      editable: true,
      render: (record) => <span className="block max-w-[300px] truncate">{truncate(record.message)}</span>,
    },
    {
      source: 'message2',
      label: `Message · ${labelFor(localeB)}`,
      editable: true,
      render: (record) => (
        <span className={`block max-w-[300px] truncate ${record.message2 ? '' : 'italic text-muted-foreground'}`}>
          {record.message2 ? truncate(record.message2) : '— missing —'}
        </span>
      ),
    },
  ];

  return <DigitDatagrid columns={columns} />;
}

export function LocalizationList() {
  return (
    <DigitList title="app.resources.localization" hasCreate sort={{ field: 'code', order: 'ASC' }}>
      <LocaleSelector />
      <PivotDatagrid />
    </DigitList>
  );
}
