'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphData } from '@/lib/api';

const COLORS: Record<string, string> = {
  Person: '#3b82f6', Lab: '#22c55e', University: '#a855f7',
  Equipment: '#f97316', ResearchDirection: '#14b8a6', Paper: '#f59e0b',
  Unknown: '#94a3b8',
};

const TYPE_LABELS: Record<string, string> = {
  Person: '人物', Lab: '实验室', University: '大学',
  Equipment: '设备', ResearchDirection: '方向', Paper: '论文',
  Unknown: '其他',
};

const REL_LABELS: Record<string, string> = {
  ADVISOR_OF: '导师→', COAUTHOR_WITH: '合作', MEMBER_OF: '成员',
  WORKS_AT: '任职', RESEARCHES_ON: '研究', HAS_EQUIPMENT: '设备',
  BELONGS_TO: '所属', AUTHORED: '发表', AFFILIATED_WITH: '所属',
  ALUMNI_OF: '校友',
};

const MAX_NODES = 40; // 限制节点数，避免杂乱

interface Props {
  data: GraphData | null;
  height?: number;
  onNodeClick?: (uuid: string, type: string) => void;
}

export default function GraphCanvas({ data, height = 500, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, number>>({});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    const W = container.clientWidth || 750;
    const H = height;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    svg.style.background = '#f8fafc';
    container.appendChild(svg);

    // 1. 去重并限制节点数——优先高连接度的节点
    const deduped = Array.from(new Map(data.nodes.map((n) => [n.uuid, n])).values());
    const egoUuid = deduped[0]?.uuid;

    // 计算每个节点的连接数
    const degree = new Map<string, number>();
    data.edges.forEach(e => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });

    // 按连接度排序，ego 节点始终保留
    const sorted = deduped.sort((a, b) => {
      if (a.uuid === egoUuid) return -1;
      if (b.uuid === egoUuid) return 1;
      return (degree.get(b.uuid) || 0) - (degree.get(a.uuid) || 0);
    });

    const activeNodes = showAll ? sorted : sorted.slice(0, MAX_NODES);
    const activeUuids = new Set(activeNodes.map(n => n.uuid));
    const activeEdges = data.edges.filter(e => activeUuids.has(e.source) && activeUuids.has(e.target));

    // 统计
    const counts: Record<string, number> = {};
    activeNodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    setStats(counts);

    // 过滤
    let filteredNodes = activeNodes;
    let filteredUuids = activeUuids;
    if (filters.size > 0) {
      filteredNodes = activeNodes.filter((n) => filters.has(n.type));
      filteredUuids = new Set(filteredNodes.map(n => n.uuid));
    }
    const filteredEdges = activeEdges.filter(e => filteredUuids.has(e.source) && filteredUuids.has(e.target));

    if (filteredNodes.length === 0) {
      container.innerHTML = '<div class="text-gray-400 text-center py-20">没有匹配的节点类型</div>';
      return;
    }

    // 力导向布局
    interface SimNode { uuid: string; x: number; y: number; vx: number; vy: number; type: string; name: string; deg: number }
    const simNodes: SimNode[] = filteredNodes.map((n, i) => {
      const a = (2 * Math.PI * i) / filteredNodes.length;
      const r = n.uuid === egoUuid ? 0 : 150 + Math.random() * 100;
      return { uuid: n.uuid, x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0, type: n.type, name: n.name || '?', deg: degree.get(n.uuid) || 0 };
    });
    const nodeMap = new Map(simNodes.map((n) => [n.uuid, n]));

    const IDEAL = 120;
    for (let iter = 0; iter < 150; iter++) {
      // 节点间排斥力
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[i].x - simNodes[j].x;
          const dy = simNodes[i].y - simNodes[j].y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
          const f = 2000 / (d * d);
          simNodes[i].vx += (dx / d) * f; simNodes[i].vy += (dy / d) * f;
          simNodes[j].vx -= (dx / d) * f; simNodes[j].vy -= (dy / d) * f;
        }
      }
      // 边吸引力
      filteredEdges.forEach((e) => {
        const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x, dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 10) return;
        const f = (d - IDEAL) * 0.02;
        s.vx += dx * f; s.vy += dy * f;
        t.vx -= dx * f; t.vy -= dy * f;
      });
      // 中心引力（ego 节点更强）
      simNodes.forEach((n) => {
        const grav = n.uuid === egoUuid ? 0.02 : 0.001;
        n.vx += (W / 2 - n.x) * grav;
        n.vy += (H / 2 - n.y) * grav;
      });
      // 阻尼
      simNodes.forEach((n) => {
        n.vx *= 0.75; n.vy *= 0.75;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(20, Math.min(W - 20, n.x));
        n.y = Math.max(20, Math.min(H - 20, n.y));
      });
    }

    // 只在边数少时显示标签
    const showLabels = filteredEdges.length <= 30;

    // 画边
    filteredEdges.forEach((e) => {
      const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
      if (!s || !t) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(s.x)); line.setAttribute('y1', String(s.y));
      line.setAttribute('x2', String(t.x)); line.setAttribute('y2', String(t.y));
      const isAdvisor = e.type === 'ADVISOR_OF';
      line.setAttribute('stroke', isAdvisor ? '#f59e0b' : '#cbd5e1');
      line.setAttribute('stroke-width', isAdvisor ? '2.5' : '1');
      line.setAttribute('opacity', isAdvisor ? '0.8' : '0.4');
      svg.appendChild(line);
      if (showLabels) {
        const lbl = REL_LABELS[e.type] || e.type;
        const tEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tEl.setAttribute('x', String((s.x + t.x) / 2));
        tEl.setAttribute('y', String((s.y + t.y) / 2 - 3));
        tEl.setAttribute('text-anchor', 'middle');
        tEl.setAttribute('font-size', '7');
        tEl.setAttribute('fill', isAdvisor ? '#d97706' : '#94a3b8');
        tEl.textContent = lbl;
        svg.appendChild(tEl);
      }
    });

    // 画节点
    simNodes.forEach((n) => {
      const isEgo = n.uuid === egoUuid;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = 'pointer';
      if (!isEgo) g.addEventListener('click', () => onNodeClick?.(n.uuid, n.type));

      const r = isEgo ? 22 : Math.max(7, Math.min(20, 8 + n.deg * 2));
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(n.x)); circle.setAttribute('cy', String(n.y));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', COLORS[n.type] || '#94a3b8');
      circle.setAttribute('stroke', isEgo ? '#1e40af' : '#fff');
      circle.setAttribute('stroke-width', isEgo ? '3' : '1.5');
      circle.setAttribute('opacity', '0.9');
      g.appendChild(circle);

      // 名字标签
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(n.x));
      label.setAttribute('y', String(n.y + r + 11));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', isEgo ? '12' : '9');
      label.setAttribute('fill', isEgo ? '#1e40af' : '#475569');
      label.setAttribute('font-weight', isEgo ? '700' : '400');
      label.textContent = isEgo ? n.name.substring(0, 20) : n.name.substring(0, 14);
      g.appendChild(label);

      svg.appendChild(g);
    });

  }, [data, height, filters, showAll, onNodeClick]);

  if (!data) return <div className="text-gray-400 text-center py-8">暂无图谱数据</div>;

  const toggleFilter = (type: string) => {
    const next = new Set(filters);
    if (next.has(type)) next.delete(type); else next.add(type);
    if (next.size === Object.keys(stats).length) next.clear();
    setFilters(next);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {Object.entries(stats).map(([type, count]) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
              filters.size === 0 || filters.has(type)
                ? 'text-white border-transparent'
                : 'text-gray-400 border-gray-200 bg-gray-50'
            }`}
            style={filters.size === 0 || filters.has(type) ? { background: COLORS[type] } : {}}
          >
            {TYPE_LABELS[type] || type} ({count})
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowAll(!showAll)} className="text-[11px] text-blue-500 hover:underline">
          {showAll ? '收起' : `显示全部(${data.nodes.length}节点)`}
        </button>
      </div>
      <div ref={containerRef} className="border rounded-xl bg-white overflow-hidden" style={{ minHeight: height }} />
      <p className="text-[11px] text-gray-400 mt-1 text-center">
        中心节点为当前人物 · 节点大小表示关联数量 · 橙色边=导师关系 · 点击类型按钮筛选
      </p>
    </div>
  );
}
