'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { search, SearchResult } from '@/lib/api';
import Link from 'next/link';

interface Facets { types: {value:string;count:number}[]; countries: {value:string;count:number}[]; fields: {value:string;count:number}[]; }

const TYPE_LABELS: Record<string, string> = { person: '人物', lab: '实验室', university: '机构', equipment: '设备', research_direction: '方向', paper: '论文', facility: '设施' };
const BADGE_COLORS: Record<string, string> = { person: 'bg-blue-100 text-blue-700', lab: 'bg-green-100 text-green-700', university: 'bg-purple-100 text-purple-700', equipment: 'bg-orange-100 text-orange-700', research_direction: 'bg-teal-100 text-teal-700', paper: 'bg-gray-100 text-gray-700', facility: 'bg-violet-100 text-violet-700' };

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') || '';
  const activeType = params.get('type') || '';
  const activeCountry = params.get('country') || '';
  const activeField = params.get('field') || '';

  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doSearch = useCallback(async () => {
    if (!q) return;
    setLoading(true); setError('');
    try {
      const res: any = await search(q, activeType || undefined);
      setResults(res.data || []);
      setTotal(res.meta?.total || 0);
      setFacets(res.facets || null);
    } catch { setError('搜索失败'); }
    finally { setLoading(false); }
  }, [q, activeType]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const nav = (key: string, val: string) => {
    const p = new URLSearchParams(params.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== 'page') { p.delete('page'); }
    router.push(`/search?${p.toString()}`);
  };

  const getLink = (r: SearchResult) => {
    switch (r.type) {
      case 'person': return `/person/${r.uuid}`;
      case 'lab': return `/lab/${r.uuid}`;
      case 'equipment': return `/equipment/${r.uuid}`;
      case 'research_direction': return `/direction/${r.uuid}`;
      case 'paper': return `/paper/${r.uuid}`;
      case 'facility': return `/facility/${r.uuid}`;
      case 'university': return `/search?q=${encodeURIComponent(r.name)}&type=university`;
      default: return `/search?q=${encodeURIComponent(r.name)}&type=${r.type}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Search bar */}
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const v = (f.get('q') as string || '').trim(); if (v) nav('q', v); }} className="mb-4">
          <div className="flex gap-2">
            <input type="text" name="q" defaultValue={q} placeholder="搜索科研人员、实验室、设备、研究方向…" className="flex-1 rounded-xl border px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <button type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">搜索</button>
          </div>
        </form>

        <div className="flex gap-6">
          {/* Filter sidebar */}
          {facets && (
            <aside className="w-56 shrink-0 space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">类型</h3>
                <div className="space-y-0.5">
                  <button onClick={() => nav('type', '')} className={`block w-full text-left text-sm px-2 py-1 rounded ${!activeType ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>全部 ({total})</button>
                  {facets.types.map((f) => (
                    <button key={f.value} onClick={() => nav('type', f.value)} className={`block w-full text-left text-sm px-2 py-1 rounded flex justify-between ${activeType === f.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                      <span>{TYPE_LABELS[f.value] || f.value}</span><span className="text-gray-400 text-xs">{f.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              {facets.countries.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">国家/地区</h3>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {facets.countries.map((f) => (
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
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {facets.fields.map((f) => (
                      <button key={f.value} onClick={() => nav('field', f.value)} className={`block w-full text-left text-sm px-2 py-1 rounded flex justify-between ${activeField === f.value ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <span>{f.value}</span><span className="text-gray-400 text-xs">{f.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}

          {/* Results */}
          <div className="flex-1 min-w-0">
            {loading && <div className="py-12 text-center text-gray-400"><div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" /> 搜索中…</div>}
            {error && <div className="py-8 text-center text-red-500">{error}</div>}
            {!loading && !error && q && (
              <>
                <p className="mb-4 text-sm text-gray-500">共 {total} 条结果「{q}」{activeType ? ` · ${TYPE_LABELS[activeType] || activeType}` : ''}</p>
                <div className="space-y-3">
                  {results.map((r) => (
                    <Link key={r.uuid} href={getLink(r)} className="block rounded-xl border bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium mr-2 ${BADGE_COLORS[r.type] || 'bg-gray-100'}`}>{TYPE_LABELS[r.type] || r.type}</span>
                          <span className="font-semibold text-gray-900">{r.name}</span>
                        </div>
                        {r.score != null && <span className="text-xs text-gray-400">{(r.score * 100).toFixed(0)}%</span>}
                      </div>
                      {r.subtitle && <p className="mt-1 text-sm text-gray-500">{r.subtitle}</p>}
                    </Link>
                  ))}
                  {results.length === 0 && <div className="rounded-xl border bg-white py-12 text-center text-gray-400"><p className="text-2xl mb-2">🔍</p><p>未找到结果</p></div>}
                </div>
              </>
            )}
            {!q && <div className="rounded-xl border bg-white py-16 text-center text-gray-400"><p className="text-lg">输入关键词开始探索科研关系网络</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<div className="p-8 text-center text-gray-400">加载中…</div>}><SearchContent /></Suspense>;
}
