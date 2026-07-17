'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const ALL_TAGS = [
  '量子计算', 'AI', '机器学习', '深度学习', '神经网络',
  'CRISPR', '基因编辑', 'mRNA', '蛋白质结构', '合成生物学',
  '拓扑材料', '高温超导', '量子材料', '二维材料', '钙钛矿',
  '碳中和', '固态电池', '氢能', '核聚变', '光伏',
  '脑机接口', '神经科学', '阿尔茨海默', '免疫治疗', '干细胞',
  'Stanford', 'MIT', '清华', '北大', '中科院',
  'Nature', 'Science', 'Cell', 'PRL', 'arXiv',
  '引力波', '暗物质', '黑洞', '系外行星', 'JWST',
  '机器人', '自动驾驶', '大语言模型', '知识图谱', '数字孪生',
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const animRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Stable ring config (shuffled once per mount)
  const rings = useMemo(() => {
    const shuffled = shuffle(ALL_TAGS);
    const configs = [
      { count: 10, r: 0.65, speed: 0.00013 },
      { count: 10, r: 0.78, speed: 0.00010 },
      { count: 10, r: 0.90, speed: 0.00007 },
      { count: 11, r: 1.02, speed: 0.00005 },
    ];
    let idx = 0;
    return configs.map((cfg) => {
      const tags = shuffled.slice(idx, idx + cfg.count);
      idx += cfg.count;
      return {
        tags: tags.map((tag, i) => ({
          tag,
          phase: (2 * Math.PI * i) / cfg.count,
        })),
        r: cfg.r,
        speed: cfg.speed,
      };
    });
  }, []);

  // JS animation loop — text stays upright
  const animate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.44;
    const t = performance.now();

    rings.forEach((ring) => {
      ring.tags.forEach((item) => {
        const el = tagsRef.current.get(item.tag);
        if (!el) return;
        const angle = item.phase + t * ring.speed;
        const x = cx + baseR * ring.r * Math.cos(angle);
        const y = cy + baseR * ring.r * Math.sin(angle);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      });
    });

    animRef.current = requestAnimationFrame(animate);
  }, [rings]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const setTagRef = useCallback((tag: string) => (el: HTMLButtonElement | null) => {
    if (el) tagsRef.current.set(tag, el);
    else tagsRef.current.delete(tag);
  }, []);

  return (
    <div ref={containerRef} className="h-screen relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {/* Tags — above everything */}
      {mounted && rings.map((ring, ri) =>
        ring.tags.map((item) => (
          <button
            key={item.tag}
            ref={setTagRef(item.tag)}
            onClick={() => router.push(`/search?q=${encodeURIComponent(item.tag)}`)}
            className="absolute pointer-events-auto whitespace-nowrap px-2.5 py-1 rounded-full
                       bg-white/6 hover:bg-white/25
                       text-white/45 hover:text-white
                       border border-white/8 hover:border-white/30
                       transition-all duration-200 cursor-pointer
                       hover:scale-125 hover:shadow-lg hover:shadow-blue-500/20"
            style={{
              transform: 'translate(-50%, -50%)',
              fontSize: `${10 + ri * 1.5}px`,
              zIndex: 60,
              willChange: 'left, top',
            }}
          >
            {item.tag}
          </button>
        ))
      )}

      {/* Center chat box */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl px-4" style={{ zIndex: 20 }}>
          <h1 className="text-center text-3xl font-bold text-white/90 mb-2 tracking-wide drop-shadow-lg">
            Targon Nexus
          </h1>
          <p className="text-center text-sm text-white/50 mb-4">
            AI 驱动的科研关系知识图谱
          </p>
          <p className="text-center text-sm text-white/40 mb-6">
            输入任意科研关键词，AI 自动发现并构建知识图谱
          </p>
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索研究人员、实验室、设备、研究方向…"
              className="w-full rounded-2xl bg-slate-800/70 backdrop-blur-xl border border-white/15
                         px-6 py-4 text-white placeholder-white/35 text-lg
                         focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30
                         shadow-2xl shadow-black/40 transition-all"
              autoFocus
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2
                         bg-blue-500 hover:bg-blue-400 text-white
                         rounded-xl px-6 py-2.5 font-medium transition-colors shadow-lg"
            >
              搜索
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
