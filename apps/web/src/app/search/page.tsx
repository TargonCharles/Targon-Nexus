'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { search, type SearchResult } from '@/lib/api';
import Link from 'next/link';

interface Facets { types: {value:string;count:number}[]; countries: {value:string;count:number}[]; fields: {value:string;count:number}[]; }

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  person: '人物', lab: '实验室', university: '大学',
  equipment: '设备', research_direction: '方向', paper: '论文', facility: '设施',
};

const BADGE_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-700',
  lab: 'bg-green-100 text-green-700',
  university: 'bg-purple-100 text-purple-700',
  research_direction: 'bg-teal-100 text-teal-700',
  equipment: 'bg-orange-100 text-orange-700',
  paper: 'bg-amber-100 text-amber-700',
};

// 优先显示中文名
function displayName(r: SearchResult): string {
  return r.chineseName || r.name || '未知';
}

function highlightMatches(text: string, query: string): React.ReactNode {
  if (!text || !query) return text;
  try {
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) => p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{p}</mark> : p);
  } catch { return text; }
}

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') || '';
  const activeType = params.get('type') || '';
  const activeCountry = params.get('country') || '';
  const activeField = params.get('field') || '';
  const activePage = parseInt(params.get('page') || '1');

  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 筛选掉奇怪的 facet 值
  const filteredCountries = useMemo(() =>
    facets?.countries?.filter(f =>
      !/^\d{4}$/.test(f.value) && !/^[0-9a-f]{8}-/.test(f.value) && f.value !== 'Unknown' && f.value.length < 30
    ) ?? [], [facets]);

  const doSearch = useCallback(async () => {
    if (!q) return;
    setLoading(true); setError('');
    try {
      const res: any = await search(q, {
        type: activeType || undefined,
        country: activeCountry || undefined,
        field: activeField || undefined,
        page: activePage,
        pageSize: PAGE_SIZE,
      });
      setResults(res.data?.items || res.data || []);
      setTotal(res.data?.total ?? res.meta?.total ?? 0);
      setFacets(res.data?.facets ?? res.facets ?? null);
    } catch { setError('搜索失败'); }
    finally { setLoading(false); }
  }, [q, activeType, activeCountry, activeField, activePage]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const nav = (key: string, val: string) => {
    const p = new URLSearchParams(params.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== 'page') p.delete('page');
    router.push(`/search?${p.toString()}`);
  };

  const getLink = (r: SearchResult) => {
    const t = r.type as string;
    switch (t) {
      case 'person': return `/person/${r.uuid}`;
      case 'lab': return `/lab/${r.uuid}`;
      case 'equipment': return `/equipment/${r.uuid}`;
      case 'research_direction': return `/search?q=${encodeURIComponent(r.name)}&type=research_direction`;
      case 'paper': return `/paper/${r.uuid}`;
      case 'university': return `/search?q=${encodeURIComponent(r.name)}&type=university`;
      default: return `/search?q=${encodeURIComponent(r.name)}&type=${t}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Search bar */}
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const v = (f.get('q') as string || '').trim(); if (v) nav('q', v); }} className="mb-4">
          <div className="flex gap-2">
            <input type="text" name="q" defaultValue={q} placeholder="搜索科研人员、实验室、机构、研究方向…" className="flex-1 rounded-xl border px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <button type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">搜索</button>
          </div>
        </form>

        {/* Active filters */}
        {(activeType || activeCountry || activeField) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {activeType && <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-sm">类型: {TYPE_LABELS[activeType] || activeType} <button onClick={() => nav('type', '')} className="ml-1 font-bold hover:text-red-500">&times;</button></span>}
            {activeCountry && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-3 py-1 text-sm">国家: {activeCountry} <button onClick={() => nav('country', '')} className="ml-1 font-bold hover:text-red-500">&times;</button></span>}
            {activeField && <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-sm">领域: {activeField} <button onClick={() => nav('field', '')} className="ml-1 font-bold hover:text-red-500">&times;</button></span>}
            <button onClick={() => { const p = new URLSearchParams(); p.set('q', q); router.push(`/search?${p.toString()}`); }} className="text-xs text-gray-400 hover:text-red-500 underline">清除全部筛选</button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Filter sidebar */}
          {facets && (
            <div className="w-48 shrink-0 space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">实体类型</h3>
                <div className="space-y-0.5">
                  {facets.types.filter(t => ['person','lab','university','research_direction'].includes(t.value)).map((f) => (
                    <button key={f.value} onClick={() => nav('type', f.value)} className={`block w-full text-left text-sm px-2 py-1 rounded flex justify-between ${activeType === f.value ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                      <span>{TYPE_LABELS[f.value] || f.value}</span><span className="text-gray-400 text-xs">{f.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              {filteredCountries.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">国家/地区</h3>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {filteredCountries.map((f) => (
                      <button key={f.value} onClick={() => nav('country', f.value)} className={`block w-full text-left text-sm px-2 py-1 rounded flex justify-between ${activeCountry === f.value ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <span>{f.value}</span><span className="text-gray-400 text-xs">{f.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {facets.fields.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">研究领域</h3>
                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                    {facets.fields.filter(f => f.value).map((f) => (
                      <button key={f.value} onClick={() => nav('field', f.value)} className={`block w-full text-left text-sm px-2 py-1 rounded flex justify-between ${activeField === f.value ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <span className="truncate">{f.value}</span><span className="text-gray-400 text-xs">{f.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 min-w-0">
            {loading && <div className="py-12 text-center text-gray-400"><div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />搜索中…</div>}
            {error && <div className="py-8 text-center text-red-500">{error}</div>}

            {!loading && !error && q && (
              <>
                <p className="mb-4 text-sm text-gray-500">
                  共 {total} 条结果「{q}」
                  {activeType ? ` · ${TYPE_LABELS[activeType] || activeType}` : ''}
                  {activeCountry ? ` · ${activeCountry}` : ''}{activeField ? ` · ${activeField}` : ''}
                </p>

                {results.length > 0 ? (
                  <div className="space-y-3">
                    {results.map((r) => (
                      <Link key={r.uuid} href={getLink(r)} className="block rounded-xl border bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium mr-2 ${BADGE_COLORS[r.type] || 'bg-gray-100'}`}>{TYPE_LABELS[r.type] || r.type}</span>
                            <span className="font-semibold text-gray-900">{highlightMatches(displayName(r), q)}</span>
                          </div>
                          {r.score != null && <span className="text-xs text-gray-400 shrink-0 ml-2">{(r.score * 100).toFixed(0)}%</span>}
                        </div>
                        {r.subtitle && <p className="mt-1 text-sm text-gray-500">{highlightMatches(r.subtitle, q)}</p>}
                        {/* 中文名补充显示 */}
                        {r.chineseName && r.name !== r.chineseName && (
                          <p className="mt-0.5 text-xs text-gray-400">{r.name}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-white py-12 text-center text-gray-400">
                    <p className="text-2xl mb-2">🔍</p>
                    <p>未找到结果</p>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    {activePage > 1 && <button onClick={() => nav('page', String(activePage - 1))} className="px-4 py-2 rounded-lg border bg-white text-sm hover:bg-gray-50">上一页</button>}
                    <span className="px-4 py-2 text-sm text-gray-500">第 {activePage} / {totalPages} 页</span>
                    {activePage < totalPages && <button onClick={() => nav('page', String(activePage + 1))} className="px-4 py-2 rounded-lg border bg-white text-sm hover:bg-gray-50">下一页</button>}
                  </div>
                )}
              </>
            )}

            {!q && (
              <div className="rounded-xl border bg-white py-16 text-center text-gray-400">
                <p className="text-xl mb-3">🔬</p>
                <p className="text-lg font-medium text-gray-600">输入科研关键词开始探索</p>
                <p className="text-sm mt-2">搜索全球科研人员、实验室、机构与研究方向</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">加载中…</div>}>
      <SearchContent />
    </Suspense>
  );
}
