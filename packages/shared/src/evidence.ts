// Evidence record utilities — mandatory for all relationships

export type EvidenceType = 'web_page' | 'publication' | 'orcid' | 'email' | 'doi' | 'manual_curation' | 'llm_extraction';

export interface EvidenceRecord {
  type: EvidenceType;
  sourceUrl: string;
  confidence: number;
  collectedAt: string;
  verifiedAt?: string;
  description?: string;
}

export interface EvidenceValidationResult { valid: boolean; errors: string[]; }
export interface EvidenceMergeResult { merged: EvidenceRecord; conflicts: string[]; }

export const EVIDENCE_REQUIREMENTS: Record<EvidenceType, { minConfidence: number; requiredFields: string[] }> = {
  web_page: { minConfidence: 0.4, requiredFields: ['sourceUrl', 'collectedAt'] },
  publication: { minConfidence: 0.6, requiredFields: ['sourceUrl', 'collectedAt'] },
  orcid: { minConfidence: 0.9, requiredFields: ['sourceUrl'] },
  email: { minConfidence: 0.5, requiredFields: ['sourceUrl'] },
  doi: { minConfidence: 0.9, requiredFields: ['sourceUrl'] },
  manual_curation: { minConfidence: 0.95, requiredFields: ['sourceUrl'] },
  llm_extraction: { minConfidence: 0.3, requiredFields: ['sourceUrl', 'collectedAt'] },
};

export function createEvidenceRecord(params: Partial<EvidenceRecord> & { type: EvidenceType; sourceUrl: string }): EvidenceRecord {
  return {
    type: params.type,
    sourceUrl: params.sourceUrl,
    confidence: params.confidence ?? 0.5,
    collectedAt: params.collectedAt ?? new Date().toISOString(),
    verifiedAt: params.verifiedAt,
    description: params.description,
  };
}

export function validateEvidence(evidence: EvidenceRecord): EvidenceValidationResult {
  const errors: string[] = [];
  const req = EVIDENCE_REQUIREMENTS[evidence.type];
  if (!req) {
    errors.push(`Unknown evidence type: ${evidence.type}`);
    return { valid: false, errors };
  }
  if (evidence.confidence < req.minConfidence) {
    errors.push(`Confidence ${evidence.confidence} below minimum ${req.minConfidence} for type ${evidence.type}`);
  }
  for (const field of req.requiredFields) {
    if (!(evidence as any)[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function deduplicateEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.type}:${r.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeEvidenceRecords(existing: EvidenceRecord, incoming: EvidenceRecord): EvidenceMergeResult {
  const conflicts: string[] = [];
  const merged: EvidenceRecord = {
    ...existing,
    confidence: Math.max(existing.confidence, incoming.confidence),
    verifiedAt: incoming.verifiedAt ?? existing.verifiedAt,
    description: existing.description ?? incoming.description,
  };
  if (existing.type !== incoming.type) {
    conflicts.push(`Type mismatch: ${existing.type} vs ${incoming.type}`);
  }
  return { merged, conflicts };
}

export function evidenceSummary(evidence: EvidenceRecord): string {
  return `[${evidence.type}] ${evidence.sourceUrl} (confidence: ${(evidence.confidence * 100).toFixed(0)}%)`;
}

export function isEvidenceSufficient(evidence: EvidenceRecord): boolean {
  const req = EVIDENCE_REQUIREMENTS[evidence.type];
  if (!req) return false;
  return evidence.confidence >= req.minConfidence;
}
