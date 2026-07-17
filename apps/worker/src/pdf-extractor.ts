// =============================================================================
// PDF 文本提取 — 轻量级纯 JavaScript 实现
//
// 从 base64 编码的 PDF rawBuffer 中提取纯文本。
// 不需要外部依赖: 利用 Node.js Buffer + PDF 文本流解析。
//
// 支持:
//   - 文本流提取 (BT/ET 块)
//   - 作者/标题元数据
//   - DOI 识别
// =============================================================================

export interface PdfContent {
  text: string;
  title?: string;
  doi?: string;
  authors?: string[];
  pageCount?: number;
  metadata: Record<string, string>;
}

/**
 * 从 base64 PDF 原始数据提取文本内容和元数据
 */
export function extractPdfContent(base64Buffer: string): PdfContent {
  const buffer = Buffer.from(base64Buffer, 'base64');
  const content: PdfContent = { text: '', metadata: {} };

  try {
    const raw = buffer.toString('latin1'); // PDF 内部使用 Latin-1 编码

    // 1. 提取元数据
    content.metadata = extractMetadata(raw);

    // 2. 提取文本流
    content.text = extractTextStream(raw);

    // 3. 识别 DOI
    const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi);
    if (doiMatch) {
      content.doi = doiMatch[0];
    }

    // 4. 尝试提取标题
    const titleFromMeta = content.metadata['Title'] || content.metadata['dc:title'];
    if (titleFromMeta) {
      content.title = titleFromMeta;
    } else {
      // 从文本首段推断
      const lines = content.text.split('\n').filter(l => l.trim().length > 20);
      if (lines.length > 0) {
        content.title = lines[0].trim().substring(0, 200);
      }
    }

    // 5. 估计页数
    const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g);
    content.pageCount = pageMatches ? pageMatches.length : undefined;

  } catch {
    content.text = '[PDF 解析失败]';
  }

  return content;
}

/**
 * 从 PDF 流中提取 BT/ET 文本块
 */
function extractTextStream(raw: string): string {
  const texts: string[] = [];

  // 匹配 BT ... ET 文本块
  const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let btMatch;

  while ((btMatch = btRegex.exec(raw)) !== null) {
    const block = btMatch[1];

    // 提取 Tj / TJ / '  / " 操作符中的文本
    // Tj: (text) Tj
    const tjMatches = block.matchAll(/\(([^)]*)\)\s*Tj/g);
    for (const m of tjMatches) {
      texts.push(m[1]);
    }

    // TJ: [(text1) num (text2) ...] TJ
    const tjArrayMatch = block.match(/\[(.*?)\]\s*TJ/s);
    if (tjArrayMatch) {
      const arrContent = tjArrayMatch[1];
      const arrMatches = arrContent.matchAll(/\(([^)]*)\)/g);
      for (const m of arrMatches) {
        texts.push(m[1]);
      }
    }
  }

  return texts
    .join(' ')
    .replace(/\\([()\\])/g, '$1')  // 去转义
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100_000);
}

/**
 * 提取 PDF 文档元数据
 */
function extractMetadata(raw: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  // /Title (xxx)
  const titleMatch = raw.match(/\/Title\s*\(([^)]*)\)/);
  if (titleMatch) metadata['Title'] = titleMatch[1];

  // /Author (xxx)
  const authorMatch = raw.match(/\/Author\s*\(([^)]*)\)/);
  if (authorMatch) metadata['Author'] = authorMatch[1];

  // /Subject (xxx)
  const subjectMatch = raw.match(/\/Subject\s*\(([^)]*)\)/);
  if (subjectMatch) metadata['Subject'] = subjectMatch[1];

  // /Keywords (xxx)
  const kwMatch = raw.match(/\/Keywords\s*\(([^)]*)\)/);
  if (kwMatch) metadata['Keywords'] = kwMatch[1];

  // /CreationDate (xxx)
  const dateMatch = raw.match(/\/CreationDate\s*\(([^)]*)\)/);
  if (dateMatch) metadata['CreationDate'] = dateMatch[1];

  // /Creator (xxx) — 生成工具
  const creatorMatch = raw.match(/\/Creator\s*\(([^)]*)\)/);
  if (creatorMatch) metadata['Creator'] = creatorMatch[1];

  return metadata;
}
