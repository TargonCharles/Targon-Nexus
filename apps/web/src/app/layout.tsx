import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Targon Nexus — AI 驱动的科研关系知识图谱',
  description: '自动发现全球研究人员、实验室、设备、论文之间的关联 — 覆盖凝聚态物理、材料科学、同步辐射等多个领域',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <main>{children}</main>
      </body>
    </html>
  );
}
