import type { FQNNode } from '../ast/fqn-router.js';
import type { SemanticAnchors } from '../ast/anchor.js';

export interface RuleContext {
  url: string;
  html: string;
  renderType: string;
}

/**
 * AstRAG Rule — ESLint-style pluggable transform unit.
 *
 * Core pipeline extracts FQNNode[] generically.
 * Rules receive that array and can filter, reorder, enrich, or re-serialize
 * for domain-specific needs (API reference, code signatures, etc.).
 *
 * A rule may implement any subset of the three hooks:
 *   transform  — modify the node list (most rules only need this)
 *   serialize  — override Markdown output (for highly custom formats)
 *   match      — declare which URLs this rule auto-applies to
 */
export interface AstRAGRule {
  /** Unique identifier, e.g. "code-signature", "stripe", "mdn" */
  name: string;
  description?: string;

  /** Return true if this rule should auto-apply to the given URL. */
  match?: (url: string) => boolean;

  /**
   * Transform FQNNode[] after core extraction.
   * Return the modified array; return the input unchanged to be a no-op.
   */
  transform?: (nodes: FQNNode[], ctx: RuleContext) => FQNNode[];

  /**
   * Custom Markdown serializer.
   * If provided, replaces the core serializer for this pipeline run.
   */
  serialize?: (nodes: FQNNode[], anchors: SemanticAnchors, ctx: RuleContext) => string;
}
