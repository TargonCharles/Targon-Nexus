'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getQualityReport } from '@/lib/api';

interface DQData {
  timestamp: string;
  totals: { persons: number; labs: number; universities: number; papers: number; equipment: number; facilities: number; relationships: number };
  issues: { orphans: number; circularAdvisors: string[][]; duplicates: number; missingEvidence: number; expired: number; lowConfidence: number };
  scores: { completeness: number; evidenceCoverage: number; freshness: number; overall: number };
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-28">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-mono text-gray-700 w-12 text-right">{pct}%</span>
    </div>
  );
}

export default function QualityPage() {
  const [dq, setDq] = useState<DQData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQualityReport().then((r) => { setDq(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">加载中…</div>;
  if (!dq) return <div className="p-8 text-center text-red-500">无法加载 DQ 报告</div>;

  const overallColor = dq.scores.overall >= 0.8 ? 'bg-green-500' : dq.scores.overall >= 0.6 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-4 inline-block">← 返回首页</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">📊 数据质量仪表盘</h1>

        {/* 总评 */}
        <div className="mt-6 bg-white rounded-xl border p-6 flex items-center gap-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${overallColor}`}>
            {Math.round(dq.scores.overall * 100)}
          </div>
          <div>
            <h2 className="font-bold text-lg">整体质量评分</h2>
            <p className="text-sm text-gray-500">最后更新: {new Date(dq.timestamp).toLocaleString('zh-CN')}</p>
          </div>
        </div>

        {/* 评分明细 */}
        <div className="mt-6 bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-bold text-gray-700">评分明细</h3>
          <ScoreBar label="完整性" score={dq.scores.completeness} color="bg-blue-500" />
          <ScoreBar label="证据覆盖率" score={dq.scores.evidenceCoverage} color="bg-green-500" />
          <ScoreBar label="数据新鲜度" score={dq.scores.freshness} color="bg-purple-500" />
        </div>

        {/* 实体统计 */}
        <div className="mt-6 bg-white rounded-xl border p-6">
          <h3 className="font-bold text-gray-700 mb-4">实体与关系统计</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              ['人物', dq.totals.persons, '👤'],
              ['实验室', dq.totals.labs, '🏛️'],
              ['大学', dq.totals.universities, '🎓'],
              ['论文', dq.totals.papers, '📄'],
              ['设备', dq.totals.equipment, '🔬'],
              ['设施', dq.totals.facilities, '⚡'],
              ['关系', dq.totals.relationships, '🔗'],
            ].map(([label, count, icon]) => (
              <div key={label as string} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl">{icon}</div>
                <div className="text-2xl font-bold text-gray-800">{count as number}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 问题列表 */}
        <div className="mt-6 bg-white rounded-xl border p-6">
          <h3 className="font-bold text-gray-700 mb-4">⚠ 质量问题</h3>
          <div className="space-y-3">
            {[
              ['孤立节点', dq.issues.orphans, '无任何关系的实体', 'bg-red-50 text-red-700'],
              ['重复人物', dq.issues.duplicates, '同名/同 ORCID 的重复节点', 'bg-orange-50 text-orange-700'],
              ['缺证据', dq.issues.missingEvidence, '关系缺少证据来源', 'bg-yellow-50 text-yellow-700'],
              ['过期数据', dq.issues.expired, '超过 90 天未验证', 'bg-yellow-50 text-yellow-700'],
              ['低置信度', dq.issues.lowConfidence, '置信度 < 0.6 的关系', 'bg-blue-50 text-blue-700'],
            ].map(([label, count, desc, cls]) => (
              <div key={label as string} className={`flex items-center justify-between p-3 rounded-lg ${cls}`}>
                <div>
                  <span className="font-medium">{label}</span>
                  <span className="text-xs ml-2 opacity-70">{desc}</span>
                </div>
                <span className="text-xl font-bold">{(count as number) > 0 ? count as number : '✅'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 循环引用警告 */}
        {dq.issues.circularAdvisors.length > 0 && (
          <div className="mt-6 bg-red-50 rounded-xl border border-red-200 p-6">
            <h3 className="font-bold text-red-700 mb-2">⚠ 循环引用检测</h3>
            {dq.issues.circularAdvisors.map((cycle, i) => (
              <div key={i} className="text-sm text-red-600 font-mono">
                {cycle.join(' → ')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
