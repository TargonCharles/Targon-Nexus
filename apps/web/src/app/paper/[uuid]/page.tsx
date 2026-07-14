'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface PaperData {
  uuid: string; doi: string; title: string; authors: Array<{
    uuid: string; name: string; englishName: string; authorOrder: number; isCorresponding: boolean;
  }>;
  journal: string; year: number; citationCount: number;
  keywords: string[]; url: string; source: string;
}

interface GraphData {
  nodes: Array<{ uuid: string; type: string; label: string; degree?: number }>;
  edges: Array<{ source: string; target: string; type: string; label: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  paper: '#3b82f6', person: '#22c55e', lab: '#a855f7',
  university: '#f97316', researchdirection: '#14b8a6', facility: '#f43f5e',
};

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uuid = params?.uuid as string;

  const [paper, setPaper] = useState<PaperData | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;

    async function fetchData() {
      try {
        const res = await fetch(`/api/v1/papers/${uuid}`);
        const json = await res.json();
        if (!json.success) { setError(json.error?.message || '论文未找到'); return; }
        setPaper(json.data);
      } catch (e: any) { setError(e.message); }
    }

    async function fetchGraph() {
      try {
        const res = await fetch(`/api/v1/papers/${uuid}/citation-graph`);
        const json = await res.json();
        if (json.success) setGraph(json.data);
      } catch { /* best-effort */ }
    }

    Promise.all([fetchData(), fetchGraph()]).finally(() => setLoading(false));
  }, [uuid]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">加载中…</div>;
  if (error) return <div className="flex items-center justify-center min-h-screen text-red-500">{error}</div>;
  if (!paper) return <div className="flex items-center justify-center min-h-screen text-red-500">论文未找到</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 返回 */}
        <Link href="/search" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
          ← 返回搜索
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{paper.title}</h1>
          <div className="flex flex-wrap gap-3 mb-4">
            {paper.journal && (
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                {paper.journal}
              </span>
            )}
            {paper.year && (
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                {paper.year}
              </span>
            )}
            <span className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm">
              引用 {paper.citationCount}
            </span>
            <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm">
              {paper.source}
            </span>
          </div>

          {/* DOI */}
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              DOI: {paper.doi}
            </a>
          )}

          {/* Authors */}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">作者 ({paper.authors?.length || 0})</h3>
            <div className="flex flex-wrap gap-2">
              {paper.authors?.map((author, idx) => (
                <Link
                  key={author.uuid || idx}
                  href={author.uuid ? `/person/${author.uuid}` : '#'}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    author.uuid
                      ? 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-900'
                      : 'bg-gray-100 border-gray-200 text-gray-500 cursor-default'
                  }`}
                  onClick={(e) => { if (!author.uuid) e.preventDefault(); }}
                >
                  {author.name || author.englishName}
                  {author.isCorresponding && <span className="text-blue-500 ml-1">✉</span>}
                </Link>
              ))}
            </div>
          </div>

          {/* Keywords */}
          {paper.keywords && paper.keywords.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">关键词</h3>
              <div className="flex flex-wrap gap-1.5">
                {paper.keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Citation Graph */}
        {graph && graph.nodes.length > 0 && (
          <div className="bg-white rounded-xl border p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">引用网络</h2>
            <div className="w-full h-[400px] bg-gray-50 rounded-lg overflow-hidden">
              <CitationGraphSVG data={graph} />
            </div>
          </div>
        )}

        {/* 外部链接 */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">外部资源</h3>
          <div className="flex gap-3">
            {paper.doi && (
              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener"
                 className="text-blue-600 hover:underline text-sm">DOI.org</a>
            )}
            {paper.doi && (
              <a href={`https://api.semanticscholar.org/CorpusID:${paper.doi}`} target="_blank" rel="noopener"
                 className="text-blue-600 hover:underline text-sm">Semantic Scholar</a>
            )}
            <a href={`https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}`}
               target="_blank" rel="noopener"
               className="text-blue-600 hover:underline text-sm">Google Scholar</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// — 简化 SVG 引用网络图 —
function CitationGraphSVG({ data }: { data: GraphData }) {
  if (!data || data.nodes.length === 0) return null;

  const W = 800;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) * 0.35;

  const nodes = data.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / data.nodes.length - Math.PI / 2;
    const r = i === 0 ? 0 : radius; // center node at origin
    return {
      ...n,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });

  const edgeSet = new Map<string, typeof data.edges[0]>();
  for (const e of data.edges) {
    edgeSet.set(`${e.source}|${e.type}|${e.target}`, e);
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {/* Edges */}
      {Array.from(edgeSet.values()).map((e, i) => {
        const src = nodes.find((n) => n.uuid === e.source);
        const tgt = nodes.find((n) => n.uuid === e.target);
        if (!src || !tgt) return null;
        return (
          <g key={i}>
            <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={e.type === 'CITES' ? '#f59e0b' : '#cbd5e1'} strokeWidth={1.5}
                  markerEnd={e.type === 'CITES' ? 'url(#arrow)' : undefined} />
            <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 - 4}
                  textAnchor="middle" fill="#94a3b8" fontSize="7">
              {e.type === 'CITES' ? '引用' : e.type === 'AUTHORED_BY' ? '作者' : e.type}
            </text>
          </g>
        );
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
      </defs>

      {/* Nodes */}
      {nodes.map((n) => (
        <g key={n.uuid} style={{ cursor: n.uuid !== nodes[0]?.uuid ? 'pointer' : 'default' }}>
          <circle cx={n.x} cy={n.y} r={Math.max(6, Math.min(20, (n.degree || 1) * 6))}
                  fill={TYPE_COLORS[n.type] || '#94a3b8'} stroke="#fff" strokeWidth={2} opacity={0.9} />
          <text x={n.x} y={n.y + 22} textAnchor="middle" fill="#64748b" fontSize="8"
                style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {n.label?.length > 20 ? n.label.substring(0, 18) + '…' : n.label}
          </text>
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(10, ${H - 50})`}>
        {Object.entries(TYPE_COLORS).slice(0, 4).map(([type, color], i) => (
          <g key={type} transform={`translate(0, ${i * 14})`}>
            <circle cx={4} cy={4} r={4} fill={color} opacity={0.9} />
            <text x={12} y={6} fill="#94a3b8" fontSize="7">
              {type === 'paper' ? '论文' : type === 'person' ? '人物' : type === 'lab' ? '实验室' : type}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
