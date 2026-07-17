'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPerson, getPersonStudents, getPersonAdvisors, getPersonGenealogy, getPersonGraph, getPersonCareer, getPersonPapers, GraphData } from '@/lib/api';
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
  const [papers, setPapers] = useState<any[]>([]);
  const [genealogy, setGenealogy] = useState<GraphData | null>(null);
  const [relationGraph, setRelationGraph] = useState<GraphData | null>(null);
  const [career, setCareer] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [pRes, sRes, aRes, gRes, grRes, cRes, ppRes] = await Promise.all([
          getPerson(uuid), getPersonStudents(uuid), getPersonAdvisors(uuid), getPersonGenealogy(uuid),
          getPersonGraph(uuid).catch(() => ({ data: null } as any)),
          getPersonCareer(uuid).catch(() => ({ data: [] })),
          getPersonPapers(uuid).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setPerson(pRes.data);
        setStudents(sRes.data || []);
        setAdvisors(aRes.data || []);
        setPapers((ppRes as any)?.data || []);
        setGenealogy(gRes.data);
        setRelationGraph((grRes as any)?.data || null);
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

  const cnName = person.chineseName || '';
  const enName = person.englishName || '';
  const dn = cnName || enName || '未知';
  const displaySub = cnName && enName && cnName !== enName ? enName : (enName && cnName !== enName ? cnName : '');
  const cnRole = ROLE_MAP[person.currentStatus] || person.currentStatus || '';
  const loc = [person.lab?.city, person.lab?.country || person.university?.country].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex justify-between items-center">
        <Link href="/search" className="text-sm text-blue-600 hover:underline">← 返回搜索</Link>
        <button
          onClick={async () => {
            const reason = prompt('请描述数据错误（如：姓名不匹配、单位错误、论文缺失等）：');
            if (reason) {
              try {
                const { reportError } = await import('@/lib/api');
                await reportError('person', uuid, reason);
                alert('已提交审核，感谢反馈！');
              } catch { alert('提交失败，请稍后重试'); }
            }
          }}
          className="text-xs text-red-400 hover:text-red-600 underline"
        >⚠️ 报错</button>
      </div>

      {/* ===== 顶部：基本信息（含照片） ===== */}
      <div className="mt-3 flex flex-wrap items-start gap-6">
        {/* 照片 */}
        <div className="shrink-0">
          {person.photoUrl ? (
            <img src={person.photoUrl} alt={dn} className="w-28 h-28 rounded-xl object-cover border-2 border-gray-200 shadow-sm" />
          ) : (
            <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-gray-200 flex items-center justify-center text-4xl text-blue-400 shadow-sm">
              {dn.charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold">{dn}</h1>
          {displaySub && <p className="text-xl text-gray-500">{displaySub}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500">
            {cnRole && <span className="bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-medium">{cnRole}</span>}
            {person.lab && (
              <Link href={`/lab/${person.lab.uuid}`} className="text-green-600 hover:underline font-medium">
                🏛 {person.lab.name || person.lab.englishName}
              </Link>
            )}
            {person.university && (
              <span className="text-purple-600">@ {person.university.name}</span>
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

      {/* ===== 统计信息 ===== */}
      <div className="mt-4 flex flex-wrap gap-4">
        {person.hIndex != null && (
          <div className="rounded-lg bg-amber-50 px-4 py-2 text-center">
            <div className="text-xl font-bold text-amber-700">{person.hIndex}</div>
            <div className="text-xs text-amber-500">H-Index</div>
          </div>
        )}
        {person.citationCount > 0 && (
          <div className="rounded-lg bg-orange-50 px-4 py-2 text-center">
            <div className="text-xl font-bold text-orange-700">{person.citationCount}</div>
            <div className="text-xs text-orange-500">引用</div>
          </div>
        )}
        <div className="rounded-lg bg-blue-50 px-4 py-2 text-center">
          <div className="text-xl font-bold text-blue-700">{person.paperCount ?? 0}</div>
          <div className="text-xs text-blue-500">论文</div>
        </div>
        <div className="rounded-lg bg-green-50 px-4 py-2 text-center">
          <div className="text-xl font-bold text-green-700">{person.coauthorCount ?? 0}</div>
          <div className="text-xs text-green-500">合作者</div>
        </div>
        {(person.advisorCount > 0 || person.studentCount > 0) && (
          <>
            <div className="rounded-lg bg-purple-50 px-4 py-2 text-center">
              <div className="text-xl font-bold text-purple-700">{person.advisorCount ?? 0}</div>
              <div className="text-xs text-purple-500">导师</div>
            </div>
            <div className="rounded-lg bg-pink-50 px-4 py-2 text-center">
              <div className="text-xl font-bold text-pink-700">{person.studentCount ?? 0}</div>
              <div className="text-xs text-pink-500">学生</div>
            </div>
          </>
        )}
        {person.description && (
          <div className="rounded-lg bg-gray-50 px-4 py-2 max-w-xs">
            <div className="text-xs text-gray-500">简介</div>
            <div className="text-sm font-medium text-gray-700 line-clamp-2">{person.description}</div>
          </div>
        )}
      </div>

      {/* ===== 论文列表 ===== */}
      {papers.length > 0 && (
        <section className="mt-8 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold mb-3">📰 发表论文 ({papers.length})</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {papers.map((pp: any, i: number) => (
              <Link key={pp.uuid || i} href={`/paper/${pp.uuid}`}
                className="block rounded-lg border bg-gray-50 p-3 hover:border-blue-300 hover:bg-white transition-colors">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{pp.title}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  {pp.year && <span>{pp.year}</span>}
                  {pp.citationCount > 0 && <span>被引 {pp.citationCount} 次</span>}
                  {pp.topics?.length > 0 && (
                    <span className="flex gap-1">
                      {pp.topics.slice(0, 3).map((t: string) => (
                        <span key={t} className="bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 text-[10px]">{t}</span>
                      ))}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== 学术家谱 ===== */}
      <section className="mt-8 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold mb-3">🧬 学术家谱</h2>
        {((person.advisorList?.length > 0) || (person.studentList?.length > 0) || advisors.length > 0 || students.length > 0) ? (
          <>
            {/* 导师列表 */}
            {((person.advisorList?.length > 0) || advisors.length > 0) && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-purple-700 mb-2">👤 导师 ({person.advisorCount || advisors.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {(person.advisorList || []).map((a: any) => (
                    <Link key={a.uuid} href={`/person/${a.uuid}`}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-100 border border-purple-200">
                      {a.name || '未知'}
                    </Link>
                  ))}
                  {advisors.filter((a: any) => !person.advisorList?.find((pa: any) => pa.uuid === a.uuid)).map((a: any) => (
                    <Link key={a.uuid} href={`/person/${a.uuid}`}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-100 border border-purple-200">
                      {a.chineseName || a.englishName || '未知'}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* 学生列表 */}
            {((person.studentList?.length > 0) || students.length > 0) && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-pink-700 mb-2">🎓 学生 ({person.studentCount || students.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {(person.studentList || []).map((s: any) => (
                    <Link key={s.uuid} href={`/person/${s.uuid}`}
                      className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-100 border border-pink-200">
                      {s.name || '未知'}
                    </Link>
                  ))}
                  {students.filter((s: any) => !person.studentList?.find((ps: any) => ps.uuid === s.uuid)).map((s: any) => (
                    <Link key={s.uuid} href={`/person/${s.uuid}`}
                      className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1.5 text-sm text-pink-700 hover:bg-pink-100 border border-pink-200">
                      {s.chineseName || s.englishName || '未知'}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* 家谱可视化 */}
            {genealogy && genealogy.nodes?.length > 0 && (
              <GenealogyTree data={genealogy} egoName={dn} onNodeClick={(id) => window.open(`/person/${id}`, '_self')} />
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400 mb-2">暂无导师/学生数据</p>
            {person.potentialAdvisors?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-2">基于合作网络的潜在导师:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {person.potentialAdvisors.map((name: string) => (
                    <span key={name} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 border border-amber-200">{name}</span>
                  ))}
                </div>
              </div>
            )}
            {person.firstPaperYear && (
              <p className="text-xs text-gray-300 mt-2">首篇论文: {person.firstPaperYear} | 活跃: {person.activeYears} 年</p>
            )}
          </div>
        )}
      </section>

      {/* ===== 职业轨迹 ==== */}
      <section className="mt-8 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold mb-4">📅 职业轨迹</h2>
        {career.length > 0 ? (
          <div className="relative pl-6 border-l-2 border-blue-200 space-y-4">
            {career.map((ev: any, i: number) => (
              <div key={ev.uuid || i} className="relative">
                <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-blue-500 bg-white" />
                <div className="text-xs text-gray-400">{ev.startYear || ''}{ev.endYear ? ` — ${ev.endYear}` : ''}</div>
                <div className="text-sm font-medium text-gray-800">{ev.description}</div>
                {ev.position && <div className="text-xs text-gray-500">{ev.position} @ {ev.institution}</div>}
                {ev.institution && !ev.position && <div className="text-xs text-gray-500">{ev.institution}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            {person.firstPaperYear ? (
              <>
                <p className="text-sm text-gray-600">首篇论文: <span className="font-semibold">{person.firstPaperYear}</span> | 活跃 <span className="font-semibold">{person.activeYears}</span> 年</p>
                {person.university && <p className="text-xs text-gray-400 mt-1">{person.university.name}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-400">暂无职业轨迹数据。</p>
            )}
          </div>
        )}
      </section>

      {/* ===== 关系图谱 ===== */}
      <section className="mt-8 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold mb-3">🕸️ 关系网络</h2>
        {relationGraph && relationGraph.nodes?.length > 0 ? (
          <GraphCanvas data={relationGraph} height={400} onNodeClick={(id) => window.open(`/person/${id}`, '_self')} />
        ) : (
          <p className="text-sm text-gray-400 py-8 text-center">暂无关系数据。爬取更多论文后会自动构建引用和合作关系网络。</p>
        )}
      </section>

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
