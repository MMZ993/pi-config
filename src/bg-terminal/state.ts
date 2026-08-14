/** Pure state helpers for the tmux-backed background terminal extension. */

/** Returns whether a completion belongs to this session and was not already delivered. */
export function completionNeedsDelivery(originSessionId: string, activeSessionId: string, delivered: boolean): boolean {
  return originSessionId === activeSessionId && !delivered;
}

/** Counts running jobs for the compact TUI footer. */
export function countRunningJobs(statuses: string[]): number {
  return statuses.filter((status) => status === "running").length;
}

/** Returns whether a persisted job belongs to the session being restored. */
export function shouldRestoreJob(originSessionId: string, activeSessionId: string): boolean {
  return originSessionId === activeSessionId;
}

/** Returns whether a restored job must resume its completion watcher. */
export function shouldWatchRestoredJob(status: string): boolean {
  return status === "running";
}

/** A cancellation in progress or completed cancellation takes precedence over completion. */
export function shouldDeliverCompletion(status: string, cancellationPending: boolean): boolean {
  return status !== "cancelled" && !cancellationPending;
}
