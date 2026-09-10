/** Pure decision logic for carrying the previous session's model across /new. */

/** Session-start reasons that may carry a previous session file. */
export type SessionStartReason = "startup" | "reload" | "new" | "resume" | "fork";

/** Minimal shape of a resolved model reference from a previous session file. */
export interface PreservableModelRef {
  provider: string;
  modelId: string;
}

/** Minimal model-registry surface the resolver needs (mirrors pi's ModelRegistry). */
export interface ModelLookup {
  find: (provider: string, modelId: string) => { provider: string; id: string } | undefined;
  hasConfiguredAuth: (model: { provider: string; id: string }) => boolean;
}

/** Returns true only for a fresh /new session that has a predecessor to inherit from. */
export function shouldPreserveModelOnSessionStart(
  reason: SessionStartReason,
  previousSessionFile: string | undefined,
): boolean {
  return reason === "new" && typeof previousSessionFile === "string" && previousSessionFile.length > 0;
}

/**
 * Resolves the previous session's model against the current registry.
 * Returns the registry model when it exists and has auth, otherwise undefined.
 * Never throws: unknown refs, missing models, and auth failures all yield undefined.
 */
export function resolvePreservedModel<T extends { provider: string; id: string }>(
  registry: ModelLookup,
  previous: PreservableModelRef | null | undefined,
): T | undefined {
  if (!previous || !previous.provider || !previous.modelId) return undefined;
  try {
    const model = registry.find(previous.provider, previous.modelId) as T | undefined;
    if (!model) return undefined;
    if (!registry.hasConfiguredAuth(model)) return undefined;
    return model;
  } catch {
    return undefined;
  }
}
