'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphData } from '@/lib/api';

const COLORS: Record<string, string> = {
  Person: '#3b82f6', Lab: '#22c55e', University: '#a855f7',
  Equipment: '#f97316', ResearchDirection: '#14b8a6',
};

const TYPE_LABELS: Record<string, string> = {
  Person: '人物', Lab: '实验室', University: '大学',
  Equipment: '设备', ResearchDirection: '方向',
};

interface Props {
  data: GraphData | null;
  height?: number;
  personOnly?: boolean;
  onNodeClick?: (uuid: string, type: string) => void;
}

const REL_LABELS: Record<string, string> = {
  ADVISOR_OF: '导师', COAUTHOR_WITH: '合作', MEMBER_OF: '成员',
  WORKS_AT: '任职', RESEARCHES_ON: '研究', HAS_EQUIPMENT: '设备', BELONGS_TO: '所属',
};

export default function GraphCanvas({ data, height = 500, personOnly, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const W = container.clientWidth || 700;
    const H = height;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    svg.style.background = '#f8fafc';
    container.appendChild(svg);

    // Count by type
    const counts: Record<string, number> = {};
    data.nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    setStats(counts);

    // Filter nodes — personOnly mode shows only Person type
    let activeNodes = data.nodes;
    if (personOnly) {
      activeNodes = data.nodes.filter((n) => n.type === 'Person');
    } else if (filters.size > 0) {
      activeNodes = data.nodes.filter((n) => filters.has(n.type));
    }

    const nodeMap = new Map(activeNodes.map((n) => [n.uuid, n]));
    const activeEdges = data.edges.filter(
      (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
    );

    // D3-style force simulation (manual for zero-dependency)
    interface SimNode { uuid: string; x: number; y: number; vx: number; vy: number; type: string; name: string; degree: number }
    // Mark ego node (first node) for center anchoring
    const egoUuid = activeNodes[0]?.uuid;
    const simNodes: SimNode[] = activeNodes.map((n, i) => {
      const a = (2 * Math.PI * i) / activeNodes.length;
      const spread = 180;
      return { uuid: n.uuid, x: W / 2 + Math.cos(a) * spread, y: H / 2 + Math.sin(a) * spread, vx: 0, vy: 0, type: n.type, name: n.name || '', degree: 0 };
    });
    const simNodeMap = new Map(simNodes.map((n) => [n.uuid, n]));

    // Count degrees for node sizing
    activeEdges.forEach((e) => {
      const s = simNodeMap.get(e.source), t = simNodeMap.get(e.target);
      if (s) s.degree++;
      if (t) t.degree++;
    });

    // Force simulation — 200 iterations for stable layout
    const IDEAL_EDGE = 140;
    for (let iter = 0; iter < 200; iter++) {
      // Repulsion: gentler O(n²) with separation-based force
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[i].x - simNodes[j].x;
          const dy = simNodes[i].y - simNodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
          const force = 3000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          simNodes[i].vx += fx; simNodes[i].vy += fy;
          simNodes[j].vx -= fx; simNodes[j].vy -= fy;
        }
      }
      // Edge attraction
      activeEdges.forEach((e) => {
        const s = simNodeMap.get(e.source), t = simNodeMap.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) return;
        const force = (dist - IDEAL_EDGE) * 0.03;
        s.vx += dx * force; s.vy += dy * force;
        t.vx -= dx * force; t.vy -= dy * force;
      });
      // Ego node: strong center gravity; others: gentle center pull
      simNodes.forEach((n) => {
        const grav = n.uuid === egoUuid ? 0.01 : 0.0005;
        n.vx += (W / 2 - n.x) * grav;
        n.vy += (H / 2 - n.y) * grav;
      });
      // Damping — higher = faster stabilization
      simNodes.forEach((n) => {
        n.vx *= 0.8; n.vy *= 0.8;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(30, Math.min(W - 30, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      });
    }

    // Draw edges with relationship labels
    activeEdges.forEach((e) => {
      const s = simNodeMap.get(e.source), t = simNodeMap.get(e.target);
      if (!s || !t) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(s.x)); line.setAttribute('y1', String(s.y));
      line.setAttribute('x2', String(t.x)); line.setAttribute('y2', String(t.y));
      line.setAttribute('stroke', e.type === 'ADVISOR_OF' ? '#f59e0b' : '#cbd5e1');
      line.setAttribute('stroke-width', e.type === 'ADVISOR_OF' ? '2' : '1');
      line.setAttribute('opacity', '0.6');
      svg.appendChild(line);
      // Edge label
      const label = REL_LABELS[e.type] || e.type;
      if (label) {
        const tEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tEl.setAttribute('x', String((s.x + t.x) / 2)); tEl.setAttribute('y', String((s.y + t.y) / 2 - 4));
        tEl.setAttribute('text-anchor', 'middle'); tEl.setAttribute('font-size', '8'); tEl.setAttribute('fill', '#94a3b8');
        tEl.textContent = label;
        svg.appendChild(tEl);
      }
    });

    // Draw nodes
    simNodes.forEach((n) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => onNodeClick?.(n.uuid, n.type));

      const r = Math.max(8, Math.min(28, 10 + n.degree * 3));
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(n.x)); circle.setAttribute('cy', String(n.y));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', COLORS[n.type] || '#94a3b8');
      circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
      circle.setAttribute('opacity', '0.9');
      g.appendChild(circle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(n.x)); label.setAttribute('y', String(n.y + r + 12));
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '10');
      label.setAttribute('fill', '#334155'); label.setAttribute('font-weight', '500');
      label.textContent = n.name.substring(0, 16);
      g.appendChild(label);

      svg.appendChild(g);
    });
  }, [data, height, filters, onNodeClick]);

  if (!data) return <div className="text-gray-400 text-center py-8">暂无图谱数据</div>;

  const toggleFilter = (type: string) => {
    const next = new Set(filters);
    if (next.has(type)) next.delete(type); else next.add(type);
    // If all types selected, clear filter
    if (next.size === Object.keys(stats).length) next.clear();
    setFilters(next);
  };

  return (
    <div>
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        {Object.entries(stats).map(([type, count]) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filters.size === 0 || filters.has(type)
                ? 'text-white'
                : 'text-gray-400 bg-gray-100'
            }`}
            style={{ background: filters.size === 0 || filters.has(type) ? COLORS[type] : undefined }}
          >
            {TYPE_LABELS[type] || type} ({count})
          </button>
        ))}
      </div>
      {/* Graph */}
      <div ref={containerRef} className="border rounded-xl bg-white overflow-hidden" style={{ minHeight: height }} />
      <p className="text-xs text-gray-400 mt-1 text-center">
        力导向布局 · 节点大小表示关联数量 · 点击类型筛选 · {data.nodes.length} 节点 {data.edges.length} 边
      </p>
    </div>
  );
}
