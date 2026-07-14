'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getLab, getLabMembers, getLabDirections, getLabGraph, GraphData } from '@/lib/api';
import GraphCanvas from '@/components/GraphCanvas';

export default function LabPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [lab, setLab] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [directions, setDirections] = useState<any[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [lRes, mRes, dRes, gRes] = await Promise.all([
          getLab(uuid), getLabMembers(uuid), getLabDirections(uuid), getLabGraph(uuid),
        ]);
        if (cancelled) return;
        setLab(lRes.data);
        setMembers(mRes.data || []);
        setDirections(dRes.data || []);
        setGraph(gRes.data);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.message?.includes('404')) { setLab(null); }
        else { setError('加载失败，请检查 API 服务'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; controller.abort(); };
  }, [uuid]);

  if (loading) return <div className="p-8 text-center text-gray-400">加载中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!lab) return <div className="p-8 text-center text-red-500">未找到该实验室</div>;

  const dn = lab.name || lab.englishName || '未知实验室';
  const sub = [lab.abbreviation, lab.university?.englishName || lab.university?.chineseName, lab.country].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/search" className="text-sm text-blue-600 hover:underline mb-2 inline-block">← 返回搜索</Link>
      <h1 className="text-3xl font-bold mt-2">{dn}</h1>
      {lab.englishName && lab.englishName !== dn && <p className="text-xl text-gray-500 mt-1">{lab.englishName}</p>}
      <p className="text-gray-500 mt-2">{sub}</p>
      {lab.description && <p className="text-gray-600 mt-3 max-w-2xl">{lab.description}</p>}

      <section className="mt-6">
        <h2 className="font-semibold text-lg mb-3">🕸️ 关系图谱</h2>
        <GraphCanvas data={graph} height={450} onNodeClick={(uuid, type) => {
          const routes: Record<string, string> = { Person: '/person/', Lab: '/lab/', Equipment: '/equipment/', ResearchDirection: '/direction/' };
          const base = routes[type];
          if (base) window.open(`${base}${uuid}`, '_self');
        }} />
      </section>

      <div className="grid gap-6 md:grid-cols-3 mt-6">
        <div className="md:col-span-2 space-y-6">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold text-lg mb-3">成员（{members.length} 人）</h2>
            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map((m: any) => (
                  <Link key={m.uuid} href={`/person/${m.uuid}`} className="block rounded-lg px-3 py-2 hover:bg-gray-50 border">
                    <span className="font-medium">{m.englishName}</span>
                    {m.chineseName && <span className="text-gray-500 ml-2">{m.chineseName}</span>}
                  </Link>
                ))}
              </div>
            ) : <p className="text-gray-400">暂无成员数据</p>}
          </section>
          {directions.length > 0 && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold text-lg mb-3">研究方向</h2>
              <div className="flex flex-wrap gap-2">
                {directions.map((d: any) => (
                  <Link key={d.uuid} href={`/search?q=${encodeURIComponent(d.name)}&type=research_direction`} className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700 hover:bg-teal-100">{d.name}</Link>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          {lab.university && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">所属机构</h3>
              <p className="font-semibold">{lab.university.englishName || lab.university.chineseName}</p>
            </div>
          )}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">地点</h3>
            <p>{(lab.city || '未知') + ', ' + (lab.country || '未知')}</p>
          </div>
          {lab.keywords?.length > 0 && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">关键词</h3>
              <div className="flex flex-wrap gap-1">
                {lab.keywords.map((kw: string) => <span key={kw} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{kw}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
