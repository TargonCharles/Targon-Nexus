'use client';

import { useEffect, useRef } from 'react';
import type { GraphData } from '@/lib/api';

interface Props { data: GraphData | null; egoName: string; onNodeClick?: (uuid: string) => void; }

const NODE_W = 140; const NODE_H = 36; const V_GAP = 60; const H_GAP = 35;

export default function GenealogyTree({ data, egoName, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current || !data.nodes.length) return;
    const svg = svgRef.current;
    svg.innerHTML = '';

    // Index — prefer Chinese name
    const nameMap = new Map(data.nodes.map((n) => [n.uuid, (n as any).chineseName || n.name || n.uuid]));
    const advisors = new Map<string, string[]>();  // child → [advisor]
    const students = new Map<string, string[]>();   // advisor → [students]
    const peers = new Map<string, string[]>();       // person → [coauthors]

    // Filter bad edges (URLs, missing nodes, etc.)
    const validEdges = data.edges.filter((e) =>
      e.source && e.target &&
      !e.source.startsWith('http') && !e.target.startsWith('http') &&
      nameMap.has(e.source) && nameMap.has(e.target)
    );

    validEdges.forEach((e) => {
      if (e.type === 'ADVISOR_OF') {
        if (!students.has(e.source)) students.set(e.source, []);
        students.get(e.source)!.push(e.target);
        if (!advisors.has(e.target)) advisors.set(e.target, []);
        advisors.get(e.target)!.push(e.source);
      } else if (e.type === 'COAUTHOR_WITH') {
        if (!peers.has(e.source)) peers.set(e.source, []);
        peers.get(e.source)!.push(e.target);
      }
    });

    const ego = data.nodes.find((n) => n.name === egoName || n.uuid.includes(egoName.toLowerCase().replace(/\s+/g, '-')));
    const egoUuid = ego?.uuid ?? data.nodes[0]?.uuid;
    const egoN = nameMap.get(egoUuid) || egoUuid;

    // Collect all tree nodes with (level, column)
    interface TNode { uuid: string; name: string; lvl: number; col: number; }
    const placed = new Set<string>();
    const nodes: TNode[] = [];

    const place = (uuid: string, lvl: number, col: number) => {
      if (placed.has(uuid)) return;
      placed.add(uuid);
      nodes.push({ uuid, name: nameMap.get(uuid) || uuid, lvl, col });
    };

    // Advisors above (level -1)
    const advs = advisors.get(egoUuid) ?? [];
    advs.forEach((a, i) => place(a, -1, i - Math.floor(advs.length / 2)));

    // Ego
    place(egoUuid, 0, 0);

    // Students below (level 1)
    const stus = students.get(egoUuid) ?? [];
    stus.forEach((s, i) => place(s, 1, i - Math.floor(stus.length / 2)));

    // Students' students (level 2)
    stus.forEach((s) => {
      const gs = students.get(s) ?? [];
      gs.forEach((g, j) => place(g, 2, j - Math.floor(gs.length / 2)));
    });

    // Coauthors at ego level
    const peers_ = peers.get(egoUuid) ?? [];
    peers_.forEach((p, i) => place(p, 0, (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 2)));

    // Layout: compute pixel positions
    const maxCols = new Map<number, number>(); // lvl → max col span
    nodes.forEach((n) => {
      const cur = maxCols.get(n.lvl) ?? 0;
      maxCols.set(n.lvl, Math.max(cur, Math.abs(n.col)));
    });

    const COL_SPACING = NODE_W + H_GAP;
    const positions = nodes.map((n) => ({
      ...n,
      x: (maxCols.get(n.lvl) ?? 0) * COL_SPACING + n.col * COL_SPACING,
      y: (n.lvl + 1) * V_GAP + n.lvl * NODE_H,
    }));

    // Compute SVG bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + NODE_W);
      minY = Math.min(minY, p.y - 12); maxY = Math.max(maxY, p.y + NODE_H + 12);
    });
    const pad = 40;
    const W = Math.max(500, maxX - minX + pad * 2);
    const H = Math.max(300, maxY - minY + pad * 2);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = '100%';
    svg.style.background = '#fafbfc';

    // Background grid
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    grid.setAttribute('width', String(W)); grid.setAttribute('height', String(H));
    grid.setAttribute('fill', '#fafbfc'); svg.appendChild(grid);

    // Offset all positions
    const ox = -minX + pad, oy = -minY + pad;
    positions.forEach((p) => { p.x += ox; p.y += oy; });

    // Draw edges
    positions.forEach((tn) => {
      // Parent (advisor) edge
      if (tn.lvl <= 0) return;
      const parentUuids = advisors.get(tn.uuid);
      if (!parentUuids) return;
      parentUuids.forEach((pu) => {
        const parent = positions.find((n) => n.uuid === pu);
        if (!parent) return;
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', String(parent.x + NODE_W / 2)); l.setAttribute('y1', String(parent.y + NODE_H));
        l.setAttribute('x2', String(tn.x + NODE_W / 2)); l.setAttribute('y2', String(tn.y));
        l.setAttribute('stroke', '#f59e0b'); l.setAttribute('stroke-width', '2');
        svg.appendChild(l);
      });
    });

    // Draw coauthor edges (horizontal)
    positions.forEach((tn) => {
      if (tn.lvl !== 0 || tn.uuid === egoUuid) return;
      const egoPos = positions.find((n) => n.uuid === egoUuid);
      if (!egoPos) return;
      if (peers.get(egoUuid)?.includes(tn.uuid)) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const fromX = tn.x < egoPos.x ? tn.x + NODE_W : tn.x;
        const toX = tn.x < egoPos.x ? egoPos.x : egoPos.x + NODE_W;
        const midY = egoPos.y + NODE_H / 2;
        l.setAttribute('x1', String(fromX)); l.setAttribute('y1', String(midY));
        l.setAttribute('x2', String(toX)); l.setAttribute('y2', String(midY));
        l.setAttribute('stroke', '#94a3b8'); l.setAttribute('stroke-width', '1'); l.setAttribute('stroke-dasharray', '4,3');
        svg.appendChild(l);
      }
    });

    // Draw nodes
    positions.forEach((tn) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      if (onNodeClick) { g.style.cursor = 'pointer'; g.addEventListener('click', () => onNodeClick(tn.uuid)); }

      const isEgo = tn.uuid === egoUuid;
      const bg = isEgo ? '#3b82f6' : tn.lvl < 0 ? '#fef3c7' : tn.lvl === 0 ? '#f1f5f9' : '#dbeafe';
      const border = isEgo ? '#2563eb' : tn.lvl < 0 ? '#f59e0b' : '#cbd5e1';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(tn.x)); rect.setAttribute('y', String(tn.y));
      rect.setAttribute('width', String(NODE_W)); rect.setAttribute('height', String(NODE_H));
      rect.setAttribute('rx', '6'); rect.setAttribute('fill', bg); rect.setAttribute('stroke', border);
      rect.setAttribute('stroke-width', isEgo ? '2' : '1');
      g.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(tn.x + NODE_W / 2)); text.setAttribute('y', String(tn.y + NODE_H / 2 + 4));
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '12');
      text.setAttribute('fill', isEgo ? '#fff' : '#1e293b');
      text.setAttribute('font-weight', isEgo ? 'bold' : 'normal');
      text.textContent = tn.name.substring(0, 10);
      g.appendChild(text);

      // Role badge
      if (!isEgo) {
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badge.setAttribute('x', String(tn.x + NODE_W / 2)); badge.setAttribute('y', String(tn.y - 4));
        badge.setAttribute('text-anchor', 'middle'); badge.setAttribute('font-size', '8'); badge.setAttribute('fill', '#94a3b8');
        badge.textContent = tn.lvl < 0 ? '导师' : tn.lvl === 1 ? '学生' : tn.lvl === 2 ? '�传' : '同行';
        g.appendChild(badge);
      }

      svg.appendChild(g);
    });
  }, [data, egoName]);

  if (!data || !data.nodes.length) return <div className="rounded-xl border bg-white py-12 text-center text-gray-400">暂无家谱数据</div>;
  return <svg ref={svgRef} className="w-full border rounded-xl bg-white" style={{ minHeight: 350 }} />;
}
