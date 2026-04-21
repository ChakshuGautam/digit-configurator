import { useMemo } from 'react';
import { useGetList, type RaRecord } from 'ra-core';

// ---------- Types -----------------------------------------------------------

interface TimeSeriesData {
  labels: string[];
  cumTotal: number[];
  cumAddressed: number[];
  bySource: Record<string, number[]>;
  open: number[];
  addressed: number[];
}

interface BreakdownRow {
  name: string;
  open: number;
  closed: number;
  total: number;
  avgResolution: number;
  completionRate: number;
}

export interface PgrStats {
  total: number;
  closed: number;
  completionRate: number;

  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byDepartment: Record<string, number>;
  topTypes: { name: string; count: number }[];

  timeSeries: TimeSeriesData;
  citizensSeries: { labels: string[]; counts: number[] };

  byBoundary: BreakdownRow[];
  byDeptTable: BreakdownRow[];
  byTypeTable: BreakdownRow[];
  byChannelTable: BreakdownRow[];
}

// ---------- Helpers ---------------------------------------------------------

const CLOSED_STATUSES = new Set(['RESOLVED', 'CLOSEDAFTERRESOLUTION']);

function isOpen(status: string): boolean {
  return !CLOSED_STATUSES.has(status);
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]}-${d.getFullYear()}`;
}

function buildBreakdown(
  groups: Map<string, RaRecord[]>,
): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const [name, items] of groups) {
    const open = items.filter((c) => isOpen(String(c.applicationStatus ?? ''))).length;
    const closed = items.length - open;
    const closedItems = items.filter((c) => CLOSED_STATUSES.has(String(c.applicationStatus ?? '')));
    let avgRes = 0;
    if (closedItems.length > 0) {
      const totalDays = closedItems.reduce((sum, c) => {
        const audit = c.auditDetails as Record<string, unknown> | undefined;
        const created = Number(audit?.createdTime ?? 0);
        const modified = Number(audit?.lastModifiedTime ?? 0);
        return sum + (modified > created ? (modified - created) / (1000 * 60 * 60 * 24) : 0);
      }, 0);
      avgRes = Math.round((totalDays / closedItems.length) * 10) / 10;
    }
    rows.push({
      name,
      open,
      closed,
      total: items.length,
      avgResolution: avgRes,
      completionRate: items.length > 0 ? Math.round((closed / items.length) * 1000) / 10 : 0,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

// ---------- Hook ------------------------------------------------------------

export function usePgrDashboardData(): {
  stats: PgrStats | null;
  isLoading: boolean;
  error: unknown;
} {
  const {
    data: complaints,
    isPending: complaintsLoading,
    error: complaintsError,
  } = useGetList<RaRecord>('complaints', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'auditDetails.createdTime', order: 'DESC' },
    filter: {},
  });

  const {
    data: complaintTypes,
    isPending: typesLoading,
  } = useGetList<RaRecord>('complaint-types', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'serviceCode', order: 'ASC' },
    filter: {},
  });

  const stats = useMemo<PgrStats | null>(() => {
    if (!complaints || complaints.length === 0) return null;

    // Build serviceCode → department lookup from complaint-types
    const codeToDept = new Map<string, string>();
    if (complaintTypes) {
      for (const ct of complaintTypes) {
        const code = String(ct.serviceCode ?? ct.id ?? '');
        const dept = String(ct.department ?? 'Unknown');
        if (code) codeToDept.set(code, dept);
      }
    }

    // ---- KPIs ----
    const total = complaints.length;
    let closed = 0;
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byDepartment: Record<string, number> = {};
    const typeCount: Record<string, number> = {};
    const citizenUuids = new Set<string>();

    // Time-series buckets
    const monthBuckets = new Map<string, { total: number; closed: number; bySrc: Record<string, number>; citizens: Set<string> }>();

    // Breakdown groupers
    const boundaryGroups = new Map<string, RaRecord[]>();
    const deptGroups = new Map<string, RaRecord[]>();
    const typeGroups = new Map<string, RaRecord[]>();
    const channelGroups = new Map<string, RaRecord[]>();

    for (const c of complaints) {
      const status = String(c.applicationStatus ?? 'UNKNOWN');
      const source = String(c.source ?? 'unknown').toLowerCase();
      const serviceCode = String(c.serviceCode ?? 'unknown');
      const dept = codeToDept.get(serviceCode) ?? 'Unknown';
      const audit = c.auditDetails as Record<string, unknown> | undefined;
      const createdTime = Number(audit?.createdTime ?? 0);
      const citizen = c.citizen as Record<string, unknown> | undefined;
      const citizenUuid = String(citizen?.uuid ?? '');
      const address = c.address as Record<string, unknown> | undefined;
      const locality = address?.locality as Record<string, unknown> | undefined;
      const localityName = String(locality?.name ?? locality?.code ?? 'Unknown');

      // KPIs
      if (CLOSED_STATUSES.has(status)) closed++;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      bySource[source] = (bySource[source] ?? 0) + 1;
      byDepartment[dept] = (byDepartment[dept] ?? 0) + 1;
      typeCount[serviceCode] = (typeCount[serviceCode] ?? 0) + 1;
      if (citizenUuid) citizenUuids.add(citizenUuid);

      // Time series
      if (createdTime > 0) {
        const mk = monthKey(createdTime);
        if (!monthBuckets.has(mk)) {
          monthBuckets.set(mk, { total: 0, closed: 0, bySrc: {}, citizens: new Set() });
        }
        const bucket = monthBuckets.get(mk)!;
        bucket.total++;
        if (CLOSED_STATUSES.has(status)) bucket.closed++;
        bucket.bySrc[source] = (bucket.bySrc[source] ?? 0) + 1;
        if (citizenUuid) bucket.citizens.add(citizenUuid);
      }

      // Breakdown groups
      if (!boundaryGroups.has(localityName)) boundaryGroups.set(localityName, []);
      boundaryGroups.get(localityName)!.push(c);

      if (!deptGroups.has(dept)) deptGroups.set(dept, []);
      deptGroups.get(dept)!.push(c);

      if (!typeGroups.has(serviceCode)) typeGroups.set(serviceCode, []);
      typeGroups.get(serviceCode)!.push(c);

      if (!channelGroups.has(source)) channelGroups.set(source, []);
      channelGroups.get(source)!.push(c);
    }

    // Top types
    const topTypes = Object.entries(typeCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Build sorted time-series
    const sortedMonths = [...monthBuckets.keys()].sort((a, b) => {
      const parseMonth = (s: string) => {
        const [m, y] = s.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return new Date(Number(y), months.indexOf(m)).getTime();
      };
      return parseMonth(a) - parseMonth(b);
    });

    const allSources = Object.keys(bySource);
    const cumTotal: number[] = [];
    const cumAddressed: number[] = [];
    const openArr: number[] = [];
    const addressedArr: number[] = [];
    const bySourceSeries: Record<string, number[]> = {};
    for (const s of allSources) bySourceSeries[s] = [];
    const citizenCounts: number[] = [];
    let runTotal = 0;
    let runClosed = 0;

    for (const mk of sortedMonths) {
      const bucket = monthBuckets.get(mk)!;
      runTotal += bucket.total;
      runClosed += bucket.closed;
      cumTotal.push(runTotal);
      cumAddressed.push(runClosed);
      openArr.push(bucket.total - bucket.closed);
      addressedArr.push(bucket.closed);
      for (const s of allSources) {
        bySourceSeries[s].push(bucket.bySrc[s] ?? 0);
      }
      citizenCounts.push(bucket.citizens.size);
    }

    const completionRate = total > 0 ? Math.round((closed / total) * 10000) / 100 : 0;

    return {
      total,
      closed,
      completionRate,
      byStatus,
      bySource,
      byDepartment,
      topTypes,
      timeSeries: {
        labels: sortedMonths,
        cumTotal,
        cumAddressed,
        bySource: bySourceSeries,
        open: openArr,
        addressed: addressedArr,
      },
      citizensSeries: { labels: sortedMonths, counts: citizenCounts },
      byBoundary: buildBreakdown(boundaryGroups),
      byDeptTable: buildBreakdown(deptGroups),
      byTypeTable: buildBreakdown(typeGroups),
      byChannelTable: buildBreakdown(channelGroups),
    };
  }, [complaints, complaintTypes]);

  return {
    stats,
    isLoading: complaintsLoading || typesLoading,
    error: complaintsError,
  };
}
