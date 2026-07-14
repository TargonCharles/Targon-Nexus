'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getFacility, getFacilityGraph, GraphData } from '@/lib/api';
import GraphCanvas from '@/components/GraphCanvas';

export default function FacilityDetailPage() {
  const params = useParams();
  const uuid = params?.uuid as string;

  const [facility, setFacility] = useState<any>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    Promise.all([
      getFacility(uuid).catch(() => ({ data: null })),
      getFacilityGraph(uuid).catch(() => ({ data: null })),
    ]).then(([fRes, gRes]) => {
      if (!fRes.data) { setError('设施未找到'); setLoading(false); return; }
      setFacility(fRes.data);
      setGraph((gRes as any)?.data || null);
      setLoading(false);
    }).catch((e: any) => { setError(e.message); setLoading(false); });
  }, [uuid]);

  if (loading) return <div className="p-8 text-center text-gray-400"><div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />加载中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!facility) return <div className="p-8 text-center text-red-500">设施未找到</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/search" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
          ← 返回搜索
        </Link>

        {/* Hero */}
        <div className="bg-white rounded-xl border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {facility.englishName || facility.name}
              </h1>
              {facility.name !== facility.englishName && (
                <p className="text-lg text-gray-500 mt-1">{facility.name}</p>
              )}
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
              {facility.facilityType === 'synchrotron' ? '同步辐射' : facility.facilityType}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
              {facility.country} · {facility.city}
            </span>
          </div>

          {facility.description && (
            <p className="mt-4 text-gray-600 text-sm leading-relaxed">{facility.description}</p>
          )}

          {facility.website && (
            <a href={facility.website} target="_blank" rel="noopener noreferrer"
               className="mt-3 inline-block text-blue-600 hover:underline text-sm">
              🌐 {facility.website}
            </a>
          )}
        </div>

        {/* Graph */}
        {graph && graph.nodes?.length > 0 && (
          <div className="bg-white rounded-xl border p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">关联网络</h2>
            <GraphCanvas data={graph} height={400} onNodeClick={(id) => window.open(`/lab/${id}`, '_self')} />
          </div>
        )}

        {/* 元信息 */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-medium text-gray-500">设施信息</h3>
          <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
            <div><span className="text-gray-400">类型:</span> <span className="text-gray-700">同步辐射光源</span></div>
            <div><span className="text-gray-400">国家:</span> <span className="text-gray-700">{facility.country}</span></div>
            <div><span className="text-gray-400">城市:</span> <span className="text-gray-700">{facility.city}</span></div>
            <div><span className="text-gray-400">UUID:</span> <span className="text-gray-500 font-mono text-xs">{facility.uuid}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

