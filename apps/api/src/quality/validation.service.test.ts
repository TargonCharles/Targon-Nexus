import { Test, TestingModule } from '@nestjs/testing';
import { Neo4jService } from '../neo4j/neo4j.service';
import { ValidationService } from './validation.service';

describe('ValidationService', () => {
  let service: ValidationService;
  let neo4j: jest.Mocked<Pick<Neo4jService, 'read'>>;

  beforeEach(async () => {
    neo4j = { read: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        { provide: Neo4jService, useValue: neo4j },
      ],
    }).compile();

    service = module.get(ValidationService);
  });

  describe('validateAll', () => {
    it('returns empty issues when data is clean', async () => {
      neo4j.read
        .mockResolvedValueOnce([])  // orcid — all valid
        .mockResolvedValueOnce([])  // email — all valid
        .mockResolvedValueOnce([])  // url person — empty
        .mockResolvedValueOnce([])  // url lab — empty
        .mockResolvedValueOnce([])  // confidence — none out of range
        .mockResolvedValueOnce([{ c: 1 }]); // count

      const report = await service.validateAll();
      expect(report.issues).toHaveLength(0);
    });

    it('flags invalid ORCID formats', async () => {
      neo4j.read
        .mockResolvedValueOnce([{ uuid: 'p1', orcid: 'not-an-orcid' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ c: 1 }]);

      const report = await service.validateAll();
      const orcidIssues = report.issues.filter((i) => i.field === 'orcid');
      expect(orcidIssues.length).toBeGreaterThanOrEqual(1);
      expect(orcidIssues[0].severity).toBe('error');
    });

    it('flags invalid email formats', async () => {
      neo4j.read
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ uuid: 'p1', email: 'not-an-email' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ c: 1 }]);

      const report = await service.validateAll();
      const emailIssues = report.issues.filter((i) => i.field === 'email');
      expect(emailIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('calculates passRate correctly', async () => {
      neo4j.read
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ c: 10 }]);

      const report = await service.validateAll();
      expect(report.totalChecked).toBe(10);
      expect(report.passRate).toBe(1);
    });
  });
});
