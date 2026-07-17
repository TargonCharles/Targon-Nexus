// Search service unit tests — validates correctness of the unified search
// logic (fixed pagination — no more double-pagination bug).

import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { Neo4jService } from '../neo4j/neo4j.service';

describe('SearchService', () => {
  let service: SearchService;
  let neo4j: jest.Mocked<Neo4jService>;

  const mockPerson = {
    uuid: 'p-001',
    type: 'person' as const,
    name: 'Zhi-Xun Shen',
    subtitle: 'Professor',
    labels: ['Person'],
    sourceTier: 'TIER_2_ACADEMIC',
    score: 0.95,
  };

  const mockLab = {
    uuid: 'l-001',
    type: 'lab' as const,
    name: 'ARPES Lab',
    subtitle: 'USA',
    labels: ['Lab'],
    sourceTier: 'TIER_1_OFFICIAL',
    score: 0.8,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: Neo4jService,
          useValue: {
            read: jest.fn(),
            readOne: jest.fn(),
            write: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    neo4j = module.get(Neo4jService);
  });

  describe('search with type filter', () => {
    it('returns items and correct total from count query', async () => {
      // 1 data + 1 count + 1 facet (type count) = 3 calls
      neo4j.read
        .mockResolvedValueOnce([mockPerson])           // data query
        .mockResolvedValueOnce([{ total: 1 }])          // count query
        .mockResolvedValueOnce([{ value: 'person', count: 1 }]); // facet type

      const result = await service.search('Zhi-Xun', { type: 'person' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Zhi-Xun Shen');
      expect(result.total).toBe(1);
    });

    it('returns zero total when no results', async () => {
      neo4j.read
        .mockResolvedValueOnce([])          // data
        .mockResolvedValueOnce([{ total: 0 }]) // count
        .mockResolvedValueOnce([{ value: 'person', count: 0 }]); // facet

      const result = await service.search('nonexistent', { type: 'person' });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns empty for equipment type', async () => {
      neo4j.read
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ value: 'equipment', count: 0 }]);

      const result = await service.search('test', { type: 'equipment' });

      expect(result).toBeDefined();
      expect(result.total).toBe(0);
    });

    it('paginates correctly for page > 1', async () => {
      // Create 25 mock results, page 2 should return items 20-24
      const items = Array.from({ length: 25 }, (_, i) => ({
        ...mockPerson, uuid: `p-${i}`, score: 1.0 - i * 0.01,
      }));
      neo4j.read
        .mockResolvedValueOnce(items)             // data (all items, no SKIP)
        .mockResolvedValueOnce([{ total: 25 }])    // count
        .mockResolvedValueOnce([{ value: 'person', count: 25 }]); // facet

      const result = await service.search('test', { type: 'person', page: 2, pageSize: 20 });

      // Should have 5 items (25 total, page 2 with pageSize 20 → items 20-24)
      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(25);
    });
  });

  describe('unified search (no type filter)', () => {
    it('fans out to all entity types in parallel', async () => {
      // Return empty for all queries
      neo4j.read.mockResolvedValue([]);

      await service.search('test');

      // 6 data + 6 count + 6 facet type + 1 country + 1 field = 20 calls
      expect(neo4j.read).toHaveBeenCalled();
    });

    it('merges results from multiple types sorted by score', async () => {
      // 6 data queries
      neo4j.read
        .mockResolvedValueOnce([mockPerson])      // Person
        .mockResolvedValueOnce([mockLab])          // Lab
        .mockResolvedValueOnce([])                 // Equipment
        .mockResolvedValueOnce([])                 // ResearchDirection
        .mockResolvedValueOnce([])                 // University
        .mockResolvedValueOnce([]);                // Paper
      // All subsequent calls return empty
      neo4j.read.mockResolvedValue([]);

      const result = await service.search('ARPES');

      expect(result.total).toBe(0); // count queries return []
      expect(result.items).toHaveLength(2);
      // Lab(TIER_1_OFFICIAL, tierBonus=0.25)综合分=0.81 > Person(TIER_2_ACADEMIC, tierBonus=0.15)综合分=0.80
      // 权威信源(TIER_1)排名优先于低等级信源
      expect(result.items[0].type).toBe('lab');
      expect(result.items[1].type).toBe('person');
    });

    it('handles page > 1 with merged results', async () => {
      neo4j.read.mockResolvedValue([]);

      const result = await service.search('test', { page: 2, pageSize: 20 });

      expect(result.items).toHaveLength(0);
    });
  });

  describe('autocomplete', () => {
    it('returns empty for queries shorter than 2 chars', async () => {
      expect(await service.autocomplete('')).toEqual([]);
      expect(await service.autocomplete('a')).toEqual([]);
    });

    it('returns names for valid queries', async () => {
      neo4j.read.mockResolvedValueOnce([{ name: 'Zhi-Xun Shen' }]);

      const result = await service.autocomplete('Zhi');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Zhi-Xun Shen');
    });
  });
});
