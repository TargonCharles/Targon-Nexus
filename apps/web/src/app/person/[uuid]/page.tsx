'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPerson, getPersonStudents, getPersonAdvisors, getPersonGenealogy, getPersonCareer, GraphData } from '@/lib/api';
import GraphCanvas from '@/components/GraphCanvas';
import GenealogyTree from '@/components/GenealogyTree';

const ROLE_MAP: Record<string, string> = {
  Professor: '教授', 'Associate Professor': '副教授', 'Assistant Professor': '助理教授',
  Postdoc: '博士后', 'PhD Student': '博士生', Emeritus: '荣休教授',
};

export default function PersonPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [person, setPerson] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [genealogy, setGenealogy] = useState<GraphData | null>(null);
  const [career, setCareer] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [pRes, sRes, aRes, gRes, cRes] = await Promise.all([
          getPerson(uuid), getPersonStudents(uuid), getPersonAdvisors(uuid), getPersonGenealogy(uuid),
          getPersonCareer(uuid).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setPerson(pRes.data);
        setStudents(sRes.data || []);
        setAdvisors(aRes.data || []);
        setGenealogy(gRes.data);
        setCareer((cRes as any)?.data || []);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.message?.includes('404')) setPerson(null);
        else setError('加载失败');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [uuid]);

  if (loading) return <div className="p-8 text-center text-gray-400">加载中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!person) return <div className="p-8 text-center text-red-500">未找到该人物</div>;

  const dn = person.englishName || person.chineseName || '未知';
  const cnRole = ROLE_MAP[person.currentStatus] || person.currentStatus || '';
  const loc = [person.lab?.city, person.lab?.country || person.university?.country].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/search" className="text-sm text-blue-600 hover:underline">← 返回搜索</Link>

      {/* ===== 顶部：基本信息（含照片） ===== */}
      <div className="mt-3 flex flex-wrap items-start gap-6">
        {/* 照片 */}
        <div className="shrink-0">
          {person.photoUrl ? (
            <img src={person.photoUrl} alt={dn} className="w-28 h-28 rounded-xl object-cover border-2 border-gray-200 shadow-sm" />
          ) : (
            <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-gray-200 flex items-center justify-center text-4xl text-blue-400 shadow-sm">
              {(person.chineseName || dn).charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold">{dn}</h1>
          {person.chineseName && person.chineseName !== dn && (
            <p className="text-xl text-gray-500">{person.chineseName}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500">
            {cnRole && <span className="bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-medium">{cnRole}</span>}
            {person.lab && (
              <Link href={`/lab/${person.lab.uuid}`} className="text-green-600 hover:underline font-medium">
                🏛 {person.lab.name || person.lab.englishName}
              </Link>
            )}
            {person.university && (
              <span className="text-purple-600">@ {person.university.englishName || person.university.chineseName}</span>
            )}
            {loc && <span className="text-gray-400">📍 {loc}</span>}
          </div>
        </div>
        {person.orcid && (
          <a href={`https://orcid.org/${person.orcid}`} target="_blank" className="text-xs text-gray-400 border rounded px-2 py-1 hover:bg-gray-50 shrink-0">
            ORCID: {person.orcid}
          </a>
        )}
      </div>

      {/* ===== 学术家谱图谱 ===== */}
      <section className="mt-8">
        <h2 className="text-lg font-bold mb-3">🧬 学术家谱</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {advisors.length > 0 && (
            <span className="text-xs text-gray-500">导师: {advisors.map((a: any) => a.englishName).join(', ')}</span>
          )}
          {students.length > 0 && (
            <span className="text-xs text-gray-500">学生: {students.length} 人</span>
          )}
        </div>
        <GenealogyTree data={genealogy} egoName={dn} onNodeClick={(id) => window.open(`/person/${id}`, '_self')} />
      </section>

      {/* ===== 职业轨迹 ==== */}
      {career.length > 0 && (
        <section className="mt-8 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold mb-4">📅 职业轨迹</h2>
          <div className="relative pl-6 border-l-2 border-blue-200 space-y-4">
            {career.map((ev: any, i: number) => (
              <div key={ev.uuid || i} className="relative">
                <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-blue-500 bg-white" />
                <div className="text-xs text-gray-400">{ev.startYear}{ev.endYear ? ` — ${ev.endYear}` : ''}</div>
                <div className="text-sm font-medium text-gray-800">{ev.description}</div>
                {ev.position && <div className="text-xs text-gray-500">{ev.position} @ {ev.institution}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 详细信息区 ===== */}
      <div className="grid gap-6 md:grid-cols-2 mt-8">
        {/* 左栏：研究方向 + 履历 */}
        <div className="space-y-6">
          {person.researchInterests?.length > 0 && (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold mb-3">🔬 研究方向</h3>
              <div className="flex flex-wrap gap-2">
                {person.researchInterests.map((ri: string) => (
                  <Link key={ri} href={`/search?q=${encodeURIComponent(ri)}`} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100">{ri}</Link>
                ))}
              </div>
            </section>
          )}

          {person.bio && (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold mb-2">📖 简介</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{person.bio}</p>
            </section>
          )}

          <section className="rounded-xl border bg-white p-5">
            <h3 className="font-bold mb-3">📋 学术履历</h3>
            <div className="space-y-2 text-sm">
              {person.lab && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">现任职</span>
                  <span>{cnRole} @ <Link href={`/lab/${person.lab.uuid}`} className="text-blue-600 hover:underline">{person.lab.name || person.lab.englishName}</Link></span>
                </div>
              )}
              {person.university && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">机构</span>
                  <span>{person.university.englishName || person.university.chineseName}{person.university.chineseName ? ` (${person.university.chineseName})` : ''}</span>
                </div>
              )}
              {person.lab?.description && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">实验室</span>
                  <span className="text-gray-600">{person.lab.description}</span>
                </div>
              )}
              {advisors.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">导师</span>
                  <span>{advisors.map((a: any) => (
                    <Link key={a.uuid} href={`/person/${a.uuid}`} className="text-blue-600 hover:underline mr-2">{a.englishName}</Link>
                  ))}</span>
                </div>
              )}
              {person.education && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">教育</span>
                  <span className="text-gray-600">{person.education}</span>
                </div>
              )}
              {person.timeline && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">经历</span>
                  <span className="text-gray-600 text-xs">{person.timeline}</span>
                </div>
              )}
              {person.title && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-20 shrink-0">职称</span>
                  <span className="text-gray-600">{person.title}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* 右栏：学生 + 位置信息 */}
        <div className="space-y-4">
          {students.length > 0 && (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold mb-3">👥 学生 ({students.length}人)</h3>
              <div className="space-y-2">
                {students.map((s: any) => (
                  <Link key={s.uuid} href={`/person/${s.uuid}`} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 border text-sm">
                    <span className="font-medium text-blue-600">{s.englishName}</span>
                    {s.chineseName && <span className="text-gray-400">{s.chineseName}</span>}
                    {s.currentStatus && <span className="text-xs text-gray-400 ml-auto">{s.currentStatus}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {person.lab && (
            <section className="rounded-xl border bg-white p-5">
              <h3 className="font-bold mb-3">🏛 实验室信息</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{person.lab.name || person.lab.englishName}</p>
                {person.lab.description && <p className="text-gray-500">{person.lab.description}</p>}
                {person.lab.country && <p className="text-gray-400">📍 {person.lab.city}, {person.lab.country}</p>}
                {person.lab.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {person.lab.keywords.map((kw: string) => <span key={kw} className="bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-xs">{kw}</span>)}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
