'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getEquipment, getEquipmentLabs, getEquipmentGraph, GraphData } from '@/lib/api';
import GraphCanvas from '@/components/GraphCanvas';

export default function EquipmentPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [equipment, setEquipment] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [eRes, lRes, gRes] = await Promise.all([
          getEquipment(uuid), getEquipmentLabs(uuid), getEquipmentGraph(uuid),
        ]);
        if (cancelled) return;
        setEquipment(eRes.data);
        setLabs(lRes.data || []);
        setGraph(gRes.data);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.message?.includes('404')) { setEquipment(null); }
        else { setError('加载失败，请检查 API 服务'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [uuid]);

  if (loading) return <div className="p-8 text-center text-gray-400">加载中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!equipment) return <div className="p-8 text-center text-red-500">未找到该设备</div>;

  const meta = [
    equipment.category ? `分类: ${equipment.category}` : '',
    equipment.brand ? `品牌: ${equipment.brand}` : '',
    equipment.model ? `型号: ${equipment.model}` : '',
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/search" className="text-sm text-blue-600 hover:underline mb-2 inline-block">← 返回搜索</Link>

      {/* 标题 */}
      <h1 className="text-3xl font-bold mt-2">{equipment.name}</h1>
      {meta.length > 0 && <p className="text-gray-500 mt-1">{meta.join(' · ')}</p>}
      {equipment.description && (
        <p className="text-gray-600 mt-3 max-w-3xl">{equipment.description}</p>
      )}

      {/* 关键词 */}
      {equipment.keywords && equipment.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {equipment.keywords.map((kw: string) => (
            <Link key={kw} href={`/search?q=${encodeURIComponent(kw)}&type=equipment`}
              className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700 hover:bg-orange-100">
              {kw}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3 mt-6">
        {/* 侧边信息 */}
        <div className="space-y-4">
          {equipment.lab && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">所属实验室</h3>
              <Link href={`/lab/${equipment.lab.uuid}`} className="font-semibold text-blue-600 hover:underline">
                {equipment.lab.name || equipment.lab.englishName}
              </Link>
            </div>
          )}

          {equipment.university && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">所属机构</h3>
              <p className="font-semibold">{equipment.university.englishName || equipment.university.chineseName}</p>
            </div>
          )}

          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-medium text-sm text-gray-500 uppercase mb-2">使用该设备的实验室</h3>
            {labs.length > 0 ? (
              <div className="space-y-1">
                {labs.map((l: any) => (
                  <Link key={l.uuid} href={`/lab/${l.uuid}`} className="block text-sm text-blue-600 hover:underline">
                    {l.name || l.englishName}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">暂无关联实验室</p>
            )}
          </div>
        </div>

        {/* 图谱 */}
        <div className="md:col-span-2">
          <h2 className="font-semibold text-lg mb-3">关系图谱</h2>
          {graph && graph.nodes?.length > 0 ? (
            <GraphCanvas data={graph} height={400} onNodeClick={(id) => window.open(`/lab/${id}`, '_self')} />
          ) : (
            <div className="rounded-xl border bg-white py-12 text-center text-gray-400">
              <p className="text-3xl mb-2">📡</p><p>暂无关系图谱数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
