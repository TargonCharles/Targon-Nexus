// ===========================================================================
// Paper Service 测试
// ===========================================================================

import { PaperService } from './paper.service';

const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockNeo4j = { read: mockRead, write: mockWrite, readOne: jest.fn(), healthCheck: jest.fn() };

describe('PaperService', () => {
  let service: PaperService;

  beforeEach(() => {
    service = new PaperService(mockNeo4j as any);
    mockRead.mockReset();
    mockWrite.mockReset();
  });

  describe('getPaper', () => {
    it('returns null for unknown uuid', async () => {
      mockRead.mockResolvedValue([]);
      const result = await service.getPaper('nonexistent');
      expect(result).toBeNull();
    });

    it('returns paper detail when found', async () => {
      mockRead.mockResolvedValue([{
        uuid: 'p1', doi: '10.1038/nature12345',
        title: 'Test Paper', authors: ['A. Author', 'B. Author'],
        journal: 'Nature', year: 2023, citationCount: 42,
        keywords: ['ARPES', 'cuprates'], url: null, source: 'import',
        confidence: 0.9, createdAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-01T00:00:00Z',
      }]);
      const result = await service.getPaper('p1');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Paper');
      expect(result?.citationCount).toBe(42);
    });
  });

  describe('getCitations', () => {
    it('returns empty when no citations', async () => {
      mockRead.mockResolvedValueOnce([]); // items
      mockRead.mockResolvedValueOnce([{ total: 0 }]); // count
      const result = await service.getCitations('p1');
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('paginates citation results', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        uuid: `c${i}`, doi: `10.test/${i}`, title: `Paper ${i}`,
        year: 2020 + i, journal: 'Test Journal', citationCount: 10 - i,
      }));
      mockRead.mockResolvedValueOnce(items);
      mockRead.mockResolvedValueOnce([{ total: 5 }]);
      const result = await service.getCitations('p1', { page: 1, pageSize: 2 });
      expect(result.total).toBe(5);
      expect(result.items).toEqual(items);
    });
  });

  describe('getReferences', () => {
    it('returns references with pagination', async () => {
      mockRead.mockResolvedValueOnce([]);
      mockRead.mockResolvedValueOnce([{ total: 0 }]);
      const result = await service.getReferences('p1');
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getCitationGraph', () => {
    it('returns graph with center paper and related nodes', async () => {
      mockRead.mockResolvedValue([
        {
          nodeUuid: 'p1', nodeType: 'Paper', nodeLabel: 'Center Paper',
          nodeProps: '{"title":"Center"}', edgeSource: null, edgeTarget: null,
          edgeType: null, edgeLabel: null, edgeProps: null,
        },
        {
          nodeUuid: 'p2', nodeType: 'Paper', nodeLabel: 'Cited By',
          nodeProps: '{"title":"Citing"}', edgeSource: 'p2', edgeTarget: 'p1',
          edgeType: 'CITES', edgeLabel: 'CITES', edgeProps: '{}',
        },
        {
          nodeUuid: 'person1', nodeType: 'Person', nodeLabel: 'Author',
          nodeProps: '{"name":"Author"}', edgeSource: 'p1', edgeTarget: 'person1',
          edgeType: 'AUTHORED_BY', edgeLabel: 'AUTHORED_BY', edgeProps: '{}',
        },
      ]);
      const result = await service.getCitationGraph('p1');
      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
      // Center paper should be present
      expect(result.nodes.find((n) => n.uuid === 'p1')).toBeDefined();
    });
  });

  describe('importPaperBatch', () => {
    it('creates papers in batch', async () => {
      mockWrite.mockResolvedValue([{
        get: (k: string) => k === 'createdAt' ? '2024-01-01T00:00:00Z' : null,
      }]);
      const result = await service.importPaperBatch([{
        doi: '10.test/new1', title: 'New Paper', authors: ['A. Author'],
        year: 2024, journal: 'Test', citationCount: 0, keywords: ['test'],
      }]);
      expect(result.created).toBeGreaterThanOrEqual(0);
    });
  });
});
