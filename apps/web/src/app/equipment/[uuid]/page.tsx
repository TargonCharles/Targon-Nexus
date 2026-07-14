'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getEquipment, getEquipmentLabs, getEquipmentGraph, GraphData } from '@/lib/api';

function GraphView({ data }: { data: GraphData | null }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return;
    const svg = svgRef.current;
    const W = 600, H = 400;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    const nodes = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length;
      const r = Math.min(W, H) * 0.35;
      return { ...n, x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle) };
    });

    data.edges.forEach((e) => {
      const src = nodes.find((n) => n.uuid === e.source);
      const tgt = nodes.find((n) => n.uuid === e.target);
      if (!src || !tgt) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(src.x)); line.setAttribute('y1', String(src.y));
      line.setAttribute('x2', String(tgt.x)); line.setAttribute('y2', String(tgt.y));
      line.setAttribute('stroke', '#cbd5e1'); line.setAttribute('stroke-width', '2');
      svg.appendChild(line);

      const mx = (src.x! + tgt.x!) / 2, my = (src.y! + tgt.y!) / 2;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(mx)); text.setAttribute('y', String(my - 4));
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '9');
      text.setAttribute('fill', '#64748b');
      text.textContent = e.type || '';
      svg.appendChild(text);
    });

    const nodeColors: Record<string, string> = {
      Person: '#3b82f6', Lab: '#22c55e', University: '#a855f7',
      Equipment: '#f97316', ResearchDirection: '#14b8a6',
    };

    nodes.forEach((n) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(n.x)); circle.setAttribute('cy', String(n.y));
      circle.setAttribute('r', '22');
      circle.setAttribute('fill', nodeColors[n.type] || '#94a3b8');
      circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
      g.appendChild(circle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(n.x)); label.setAttribute('y', String(n.y! + 34));
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '10');
      label.setAttribute('fill', '#334155'); label.setAttribute('font-weight', '500');
      label.textContent = (n.name || n.uuid || '').substring(0, 16);
      g.appendChild(label);

      svg.appendChild(g);
    });
  }, [data]);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="rounded-xl border bg-white py-12 text-center text-gray-400">
        <p className="text-3xl mb-2">📡</p>
        <p>暂无关系图谱数据</p>
        <p className="text-xs mt-1">设备尚未关联实验室或研究人员</p>
      </div>
    );
  }
  return <svg ref={svgRef} className="w-full border rounded-xl bg-white" style={{ minHeight: 400 }} />;
}

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
          <GraphView data={graph} />
        </div>
      </div>
    </div>
  );
}
