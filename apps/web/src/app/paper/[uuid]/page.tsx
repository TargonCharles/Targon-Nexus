'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPaper, getPaperCitationGraph, GraphData } from '@/lib/api';
import GraphCanvas from '@/components/GraphCanvas';

export default function PaperDetailPage() {
  const params = useParams();
  const uuid = params?.uuid as string;

  const [paper, setPaper] = useState<any>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    Promise.all([
      getPaper(uuid).catch(() => ({ data: null })),
      getPaperCitationGraph(uuid).catch(() => ({ data: null })),
    ]).then(([pRes, gRes]) => {
      if (!pRes.data) { setError('论文未找到'); setLoading(false); return; }
      setPaper(pRes.data);
      setGraph((gRes as any)?.data || null);
      setLoading(false);
    }).catch((e: any) => { setError(e.message); setLoading(false); });
  }, [uuid]);

  if (loading) return <div className="p-8 text-center text-gray-400"><div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />加载中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!paper) return <div className="p-8 text-center text-red-500">论文未找到</div>;

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
        {graph && graph.nodes?.length > 0 && (
          <div className="bg-white rounded-xl border p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">引用网络</h2>
            <GraphCanvas data={graph} height={400} onNodeClick={(id) => window.open(`/person/${id}`, '_self')} />
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

