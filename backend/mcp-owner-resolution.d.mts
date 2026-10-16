export interface McpOwnerCandidate {
  userId: string;
  email: string;
}

/**
 * Select exactly one platform-owner identity from configured allowlist matches.
 * Throws mcp_owner_missing_or_ambiguous when no unique identity can be selected.
 */
export declare function requireUniqueMcpOwner(
  candidates: Iterable<McpOwnerCandidate>
): McpOwnerCandidate;
