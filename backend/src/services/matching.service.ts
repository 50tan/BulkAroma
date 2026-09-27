import { supabase } from '../config/supabase';
import {
  MatchMapping,
  MatchType,
  MatchDecision,
  MatchEvidence,
  SupplierProduct,
  Material,
  UserMatchOverride,
} from '../types';

// ─── Similarity helpers ───────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(str: string): Set<string> {
  return new Set(normalize(str).split(' ').filter(Boolean));
}

/**
 * Dice coefficient similarity between two strings.
 * Returns 0–1.
 */
function diceSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const bg = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  };

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  for (const b of ba) if (bb.has(b)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

/** Token-overlap Jaccard similarity */
function tokenJaccard(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Matching Service ─────────────────────────────────────────────────────────

export class MatchingService {
  /**
   * Attempts to find canonical materials that match a supplier product.
   * Returns candidates sorted by descending confidence.
   */
  async findMatches(supplierProduct: SupplierProduct): Promise<MatchMapping[]> {
    const { data: materials, error } = await supabase
      .from('materials')
      .select('*, material_aliases(alias)');

    if (error) throw new Error(`Failed to fetch materials: ${error.message}`);

    const candidates: Array<{
      material: Material & { material_aliases?: Array<{ alias: string }> };
      evidence: MatchEvidence[];
      matchType: MatchType;
      confidence: number;
    }> = [];

    for (const material of materials ?? []) {
      const evidence = this.buildMatchEvidence(supplierProduct, material);
      const { matchType, confidence } = this.scoreEvidence(supplierProduct, material, evidence);

      if (confidence >= 0.3) {
        candidates.push({ material, evidence, matchType, confidence });
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence);

    // Map to MatchMapping shape (not yet persisted — call resolveMatch to persist)
    return candidates.map((c) => ({
      id: '',
      supplier_product_id: supplierProduct.id,
      material_id: c.material.id,
      match_type: c.matchType,
      confidence: c.confidence,
      decision: 'pending' as MatchDecision,
      decided_by: null,
      decided_at: null,
      evidence: c.evidence,
      created_at: new Date().toISOString(),
    }));
  }

  /**
   * Persists a match mapping and sets its decision.
   */
  async resolveMatch(
    sourceProductId: string,
    targetMaterialId: string,
    matchType: MatchType
  ): Promise<void> {
    const { error } = await supabase.from('match_mappings').upsert(
      {
        supplier_product_id: sourceProductId,
        material_id: targetMaterialId,
        match_type: matchType,
        decision: 'confirmed' as MatchDecision,
        decided_by: 'system',
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'supplier_product_id,material_id' }
    );

    if (error) throw new Error(`Failed to resolve match: ${error.message}`);
  }

  /**
   * Applies a user-supplied override to an existing or new match mapping.
   */
  async applyUserOverride(override: UserMatchOverride): Promise<void> {
    const { sourceProductId, targetMaterialId, decision, decidedBy } = override;

    const { error } = await supabase.from('match_mappings').upsert(
      {
        supplier_product_id: sourceProductId,
        material_id: targetMaterialId,
        match_type: 'user_override' as MatchType,
        confidence: decision === 'confirmed' ? 1.0 : 0.0,
        decision,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'supplier_product_id,material_id' }
    );

    if (error) throw new Error(`Failed to apply user override: ${error.message}`);
  }

  /** Computes a similarity score between two strings (0–1). */
  private calculateSimilarity(a: string, b: string): number {
    return Math.max(diceSimilarity(a, b), tokenJaccard(a, b));
  }

  /** Builds a list of field-level evidence items between a product and a material. */
  private buildMatchEvidence(
    product: SupplierProduct,
    material: Material & { material_aliases?: Array<{ alias: string }> }
  ): MatchEvidence[] {
    const evidence: MatchEvidence[] = [];

    // CAS match
    if (product.cas_number && material.cas_number) {
      const casScore = product.cas_number.trim() === material.cas_number.trim() ? 1 : 0;
      evidence.push({
        field: 'cas_number',
        supplierValue: product.cas_number,
        materialValue: material.cas_number,
        score: casScore,
      });
    }

    // Name similarity vs common_name
    const nameSim = this.calculateSimilarity(product.raw_name, material.common_name);
    evidence.push({
      field: 'common_name',
      supplierValue: product.raw_name,
      materialValue: material.common_name,
      score: nameSim,
    });

    // Name similarity vs iupac_name
    if (material.iupac_name) {
      const iupacSim = this.calculateSimilarity(product.raw_name, material.iupac_name);
      evidence.push({
        field: 'iupac_name',
        supplierValue: product.raw_name,
        materialValue: material.iupac_name,
        score: iupacSim,
      });
    }

    // Alias matches
    for (const { alias } of material.material_aliases ?? []) {
      const aliasSim = this.calculateSimilarity(product.raw_name, alias);
      if (aliasSim > 0.5) {
        evidence.push({
          field: 'alias',
          supplierValue: product.raw_name,
          materialValue: alias,
          score: aliasSim,
        });
      }
    }

    return evidence;
  }

  /**
   * Determines the best MatchType and confidence from collected evidence.
   * Follows the priority hierarchy: CAS > name match > alias > fuzzy.
   */
  private scoreEvidence(
    product: SupplierProduct,
    material: Material & { material_aliases?: Array<{ alias: string }> },
    evidence: MatchEvidence[]
  ): { matchType: MatchType; confidence: number } {
    const casEvidence = evidence.find((e) => e.field === 'cas_number');
    if (casEvidence && casEvidence.score === 1) {
      return { matchType: 'cas_match', confidence: 0.98 };
    }

    // Name match with manufacturer signal
    const nameEvidence = evidence.find((e) => e.field === 'common_name');
    if (nameEvidence && nameEvidence.score >= 0.85) {
      const hasManufacturer = Boolean(product.manufacturer && material.notes?.includes(product.manufacturer));
      return {
        matchType: hasManufacturer ? 'manufacturer_name_match' : 'normalized_name_match',
        confidence: nameEvidence.score,
      };
    }

    // Chemical identity (iupac)
    const iupacEvidence = evidence.find((e) => e.field === 'iupac_name');
    if (iupacEvidence && iupacEvidence.score >= 0.85) {
      return { matchType: 'chemical_identity_match', confidence: iupacEvidence.score };
    }

    // Alias match
    const bestAlias = evidence
      .filter((e) => e.field === 'alias')
      .sort((a, b) => b.score - a.score)[0];
    if (bestAlias && bestAlias.score >= 0.8) {
      return { matchType: 'alias_match', confidence: bestAlias.score };
    }

    // Moderate name match
    if (nameEvidence && nameEvidence.score >= 0.6) {
      return { matchType: 'normalized_name_match', confidence: nameEvidence.score };
    }

    // Fallback fuzzy
    const maxScore = Math.max(...evidence.map((e) => e.score), 0);
    if (maxScore >= 0.3) {
      return { matchType: 'fuzzy_match', confidence: maxScore * 0.7 }; // penalize fuzzy
    }

    return { matchType: 'fuzzy_match', confidence: 0 };
  }
}

export const matchingService = new MatchingService();
