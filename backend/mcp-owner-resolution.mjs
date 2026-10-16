/**
 * Select exactly one platform-owner identity from configured allowlist matches.
 * Multiple allowlisted email aliases for the same account are one identity.
 * Missing or ambiguous identities must fail closed.
 */
export function requireUniqueMcpOwner(candidates) {
  const matches = new Map();
  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate.userId !== 'string' ||
      candidate.userId.trim() === '' ||
      typeof candidate.email !== 'string' ||
      candidate.email.trim() === ''
    ) continue;
    matches.set(candidate.userId, {
      userId: candidate.userId,
      email: candidate.email,
    });
  }

  if (matches.size !== 1) {
    throw new Error('mcp_owner_missing_or_ambiguous');
  }
  return [...matches.values()][0];
}
