'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface FacilityData {
  uuid: string; name: string; englishName: string;
  country: string; city: string; website: string;
  description: string; facilityType: string; createdAt: string;
}

interface GraphData {
  nodes: Array<{ uuid: string; type: string; label: string; degree?: number }>;
  edges: Array<{ source: string; target: string; type: string; label: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  facility: '#8b5cf6', person: '#3b82f6', lab: '#22c55e',
  university: '#f97316', equipment: '#14b8a6', researchdirection: '#f43f5e',
};

export default function FacilityDetailPage() {
  const params = useParams();
  const uuid = params?.uuid as string;

  const [facility, setFacility] = useState<FacilityData | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;

    async function fetchData() {
      try {
        const res = await fetch(`/api/v1/facilities/${uuid}`);
        const json = await res.json();
        if (!json.success) { setError(json.error?.message || '设施未找到'); return; }
        setFacility(json.data);
      } catch (e: any) { setError(e.message); }
    }

    async function fetchGraph() {
      try {
        const res = await fetch(`/api/v1/facilities/${uuid}/graph`);
        const json = await res.json();
        if (json.success) setGraph(json.data);
      } catch { /* best-effort */ }
    }

    Promise.all([fetchData(), fetchGraph()]).finally(() => setLoading(false));
  }, [uuid]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">加载中…</div>;
  if (error) return <div className="flex items-center justify-center min-h-screen text-red-500">{error}</div>;
  if (!facility) return <div className="flex items-center justify-center min-h-screen text-red-500">设施未找到</div>;

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
        {graph && graph.nodes.length > 1 && (
          <div className="bg-white rounded-xl border p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">关联网络</h2>
            <div className="w-full h-[400px] bg-gray-50 rounded-lg overflow-hidden">
              <FacilityGraphSVG data={graph} />
            </div>
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

// — SVG 设施关联图 —
function FacilityGraphSVG({ data }: { data: GraphData }) {
  const W = 800; const H = 400; const cx = W / 2; const cy = H / 2;
  const radius = Math.min(W, H) * 0.35;

  const nodes = data.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / data.nodes.length - Math.PI / 2;
    const r = n.type === 'facility' ? 0 : radius;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const edgeSet = new Map<string, any>();
  for (const e of data.edges) {
    edgeSet.set(`${e.source}|${e.type}|${e.target}`, e);
  }

  const edgeLabels: Record<string, string> = {
    AFFILIATED_WITH: '所属', BELONGS_TO: '隶属', WORKS_AT: '工作于',
    HAS_EQUIPMENT: '拥有设备', RESEARCHES_ON: '研究方向',
    LOCATED_AT: '位于', MEMBER_OF: '成员',
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {Array.from(edgeSet.values()).map((e, i) => {
        const src = nodes.find((n) => n.uuid === e.source);
        const tgt = nodes.find((n) => n.uuid === e.target);
        if (!src || !tgt) return null;
        return (
          <g key={i}>
            <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="#cbd5e1" strokeWidth={1.5} />
            <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 - 4}
                  textAnchor="middle" fill="#94a3b8" fontSize="7">
              {edgeLabels[e.type] || e.type}
            </text>
          </g>
        );
      })}

      {nodes.map((n) => (
        <g key={n.uuid}>
          <circle cx={n.x} cy={n.y} r={n.type === 'facility' ? 18 : Math.max(6, Math.min(16, (n.degree || 1) * 5))}
                  fill={TYPE_COLORS[n.type] || '#94a3b8'} stroke="#fff" strokeWidth={2} opacity={0.9} />
          <text x={n.x} y={n.y + 22} textAnchor="middle" fill="#64748b" fontSize="8">
            {n.label?.length > 18 ? n.label.substring(0, 16) + '…' : n.label}
          </text>
        </g>
      ))}

      <g transform={`translate(10, ${H - 50})`}>
        {Object.entries({ facility: '设施', person: '人物', lab: '实验室', university: '机构' }).map(([type, label], i) => (
          <g key={type} transform={`translate(0, ${i * 14})`}>
            <circle cx={4} cy={4} r={4} fill={TYPE_COLORS[type] || '#94a3b8'} opacity={0.9} />
            <text x={12} y={6} fill="#94a3b8" fontSize="7">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
