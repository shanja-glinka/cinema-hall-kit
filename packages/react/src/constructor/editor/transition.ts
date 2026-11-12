import {
  parseHallConfig,
  validateEdit,
  type FieldPolicy,
  type HallConfig,
  type Issue,
} from '@cinema-hall/core';
import { EditorRejection } from './config.js';

/**
 * The outcome of a checked change.
 */
export interface TransitionResult {
  /** The new config when `issues` is empty, otherwise the unchanged previous config. */
  config: HallConfig;
  issues: Issue[];
}

/**
 * `policy` errors for every change from `prev` to `next` that touches a locked or hidden field.
 * @param prev Config before the change.
 * @param next Config after the change.
 * @param policy Field policy.
 * @returns Policy errors.
 */
export function policyIssues(prev: HallConfig, next: HallConfig, policy: FieldPolicy): Issue[] {
  return Object.keys(policy).length === 0 ? [] : validateEdit(prev, next, policy);
}

/**
 * Structure and policy check of a candidate. A candidate passes when it parses (structural rules,
 * limits, references) and touches no locked or hidden field. Semantic issues are not rejections.
 * @param prev Current config.
 * @param candidate Config to check.
 * @param policy Field policy.
 * @returns The candidate when accepted, else the previous config and the issues.
 */
export function checkCandidate(
  prev: HallConfig,
  candidate: unknown,
  policy: FieldPolicy,
): TransitionResult {
  const parsed = parseHallConfig(candidate);
  if (!parsed.ok) return { config: prev, issues: parsed.issues };
  const access = policyIssues(prev, parsed.config, policy);
  if (access.length > 0) return { config: prev, issues: access };
  return { config: parsed.config, issues: [] };
}

/**
 * Runs a pure builder and checks its result. A builder may throw `EditorRejection` for a missing target.
 * @param prev Current config.
 * @param policy Field policy.
 * @param build Pure builder of the candidate.
 * @returns The checked result.
 */
export function transition(
  prev: HallConfig,
  policy: FieldPolicy,
  build: (config: HallConfig) => unknown,
): TransitionResult {
  let candidate: unknown;
  try {
    candidate = build(prev);
  } catch (error) {
    if (error instanceof EditorRejection) return { config: prev, issues: error.issues };
    throw error;
  }
  return checkCandidate(prev, candidate, policy);
}
