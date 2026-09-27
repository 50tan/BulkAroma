import axios from 'axios';
import type {
  SearchResult,
  ComparisonRequest,
  ComparisonResult,
  Material,
  CommonMaterial,
  PriceHistoryPoint,
  PlatformStats,
  DataHealthRow,
  CrawlJob,
  ExportJob,
  ExportType,
  PaginatedResponse,
  MaterialFilters,
  MaterialSortField,
  SortDirection,
  CurrencyCode,
  SupplierCode,
} from '../types';

// ─── Axios Instance ───────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.message ?? err.message ?? 'Unknown error';
    return Promise.reject(new Error(message));
  }
);

// ─── Search ───────────────────────────────────────────────────────────────────

export async function search(q: string): Promise<SearchResult[]> {
  const { data } = await api.get<any>('/search', { params: { q } });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

// ─── Comparison ───────────────────────────────────────────────────────────────

export async function compare(req: ComparisonRequest): Promise<ComparisonResult> {
  const { data } = await api.post<ComparisonResult>('/compare', req);
  return data;
}

// ─── Materials ────────────────────────────────────────────────────────────────

export async function getMaterials(
  page = 1,
  pageSize = 50,
  filters: MaterialFilters = {},
  sort: MaterialSortField = 'name',
  direction: SortDirection = 'asc'
): Promise<PaginatedResponse<CommonMaterial>> {
  const params: Record<string, unknown> = {
    page,
    pageSize,
    sort,
    direction,
    ...filters,
  };
  if (filters.suppliers?.length) {
    params['suppliers'] = filters.suppliers.join(',');
  }
  const { data } = await api.get<PaginatedResponse<CommonMaterial>>(
    '/materials',
    { params }
  );
  return data;
}

export async function getMaterial(id: string): Promise<Material> {
  const { data } = await api.get<Material>(`/materials/${id}`);
  return data;
}

export async function getMaterialHistory(
  id: string,
  days: number
): Promise<PriceHistoryPoint[]> {
  const { data } = await api.get<PriceHistoryPoint[]>(
    `/materials/${id}/history`,
    { params: { days } }
  );
  return data;
}

// ─── Common Materials ─────────────────────────────────────────────────────────

export async function getCommonMaterials(): Promise<CommonMaterial[]> {
  const { data } = await api.get<CommonMaterial[]>('/common-materials');
  return data;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<PlatformStats> {
  const { data } = await api.get<PlatformStats>('/stats');
  return data;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

export async function getCurrencies(): Promise<ExchangeRates> {
  const { data } = await api.get<ExchangeRates>('/currencies');
  return data;
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: CurrencyCode
): Promise<number> {
  const { data } = await api.get<{ result: number }>('/currencies/convert', {
    params: { amount, from, to },
  });
  return data.result;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function requestExport(
  type: ExportType,
  params?: Record<string, unknown>
): Promise<ExportJob> {
  const { data } = await api.post<ExportJob>('/export', { type, ...params });
  return data;
}

export async function getExportJob(id: string): Promise<ExportJob> {
  const { data } = await api.get<ExportJob>(`/export/${id}`);
  return data;
}

// ─── Admin: Crawl ─────────────────────────────────────────────────────────────

export async function triggerCrawl(
  supplier: SupplierCode | 'all'
): Promise<CrawlJob> {
  const { data } = await api.post<CrawlJob>('/admin/crawl', { supplier });
  return data;
}

export async function getCrawlStatus(id: string): Promise<CrawlJob> {
  const { data } = await api.get<CrawlJob>(`/admin/crawl/${id}`);
  return data;
}

export async function getRecentCrawls(): Promise<CrawlJob[]> {
  const { data } = await api.get<CrawlJob[]>('/admin/crawl');
  return data;
}

// ─── Admin: Data Health ───────────────────────────────────────────────────────

export async function getDataHealth(): Promise<DataHealthRow[]> {
  const { data } = await api.get<DataHealthRow[]>('/admin/data-health');
  return data;
}

// ─── Admin: Match Management ──────────────────────────────────────────────────

export interface MatchRecord {
  id: string;
  materialId: string;
  materialName: string;
  supplier: SupplierCode;
  supplierProductName: string;
  confidence: number;
  status: 'auto' | 'verified' | 'rejected';
  casMatch: boolean | null;
  nameScore: number | null;
  createdAt: string;
}

export async function getMatches(
  status?: 'auto' | 'verified' | 'rejected',
  page = 1
): Promise<PaginatedResponse<MatchRecord>> {
  const { data } = await api.get<PaginatedResponse<MatchRecord>>(
    '/admin/matches',
    { params: { status, page } }
  );
  return data;
}

export async function verifyMatch(id: string): Promise<MatchRecord> {
  const { data } = await api.patch<MatchRecord>(`/admin/matches/${id}/verify`);
  return data;
}

export async function rejectMatch(id: string): Promise<MatchRecord> {
  const { data } = await api.patch<MatchRecord>(`/admin/matches/${id}/reject`);
  return data;
}

export default api;
