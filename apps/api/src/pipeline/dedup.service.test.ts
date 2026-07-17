import { Test, TestingModule } from '@nestjs/testing';
import { Neo4jService } from '../neo4j/neo4j.service';
import { DedupService } from './dedup.service';

describe('DedupService', () => {
  let service: DedupService;
  let neo4j: jest.Mocked<Pick<Neo4jService, 'read' | 'write'>>;

  beforeEach(async () => {
    neo4j = {
      read: jest.fn(),
      write: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DedupService,
        { provide: Neo4jService, useValue: neo4j },
      ],
    }).compile();

    service = module.get(DedupService);
  });

  describe('deduplicate', () => {
    it('returns empty when no duplicates found', async () => {
      // All 5 phases return empty
      neo4j.read.mockResolvedValue([]);
      const result = await service.deduplicate();
      expect(result.count).toBe(0);
      expect(result.merges).toEqual([]);
    });

    it('merges by ORCID and produces merge records', async () => {
      // Phase 1: ORCID dup, Phase 2-5: empty
      neo4j.read
        .mockResolvedValueOnce([{ orcid: '0000-0002-1825-0097', uuids: ['canonical', 'dup1'] }])
        .mockResolvedValueOnce([])  // email dups
        .mockResolvedValueOnce([])  // name+institution
        .mockResolvedValueOnce([])  // exact name
        .mockResolvedValueOnce([]); // fuzzy name

      const result = await service.deduplicate();
      expect(result.count).toBe(1);
      expect(result.merges[0].strategy).toBe('orcid');
      expect(result.merges[0].keptUUID).toBe('canonical');
    });

    it('merges by email exact match', async () => {
      neo4j.read
        .mockResolvedValueOnce([])  // no ORCID
        .mockResolvedValueOnce([{ email: 'test@stanford.edu', uuids: ['a', 'b'] }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.deduplicate();
      expect(result.count).toBe(1);
      expect(result.merges[0].strategy).toBe('email');
    });

    it('skips known exclusion names in name-phase merge', async () => {
      neo4j.read
        .mockResolvedValueOnce([])  // ORCID
        .mockResolvedValueOnce([])  // email
        .mockResolvedValueOnce([])  // name+institution
        .mockResolvedValueOnce([{ name: 'Xingjiang Zhou', uuids: ['a', 'b'] }])
        .mockResolvedValueOnce([]); // fuzzy

      const result = await service.deduplicate();
      expect(result.count).toBe(0); // Skipped due to exclusion
    });

    it('fuzzy merge groups by sorted name parts', async () => {
      neo4j.read
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { uuid: 'a', name: 'Hong Ding' },
          { uuid: 'b', name: 'Ding Hong' },
          { uuid: 'c', name: 'Zhi-Xun Shen' },
        ]);

      const result = await service.deduplicate();
      expect(result.count).toBe(1);
      expect(result.merges[0].strategy).toBe('fuzzy_name');
    });
  });
});
