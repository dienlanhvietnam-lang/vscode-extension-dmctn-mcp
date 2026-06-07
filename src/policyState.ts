/** Bump when DMCTN-MCP.agent.md / copilot-instructions templates change materially. */
export const POLICY_VERSION = "4";

export const GLOBAL_FIRST_RUN_KEY = "dmctnMcp.firstRunCompleted";
export const GLOBAL_POLICY_VERSION_KEY = "dmctnMcp.appliedPolicyVersion";

export interface PolicyGlobalState {
  get<T>(key: string, defaultValue?: T): T | undefined;
}

export interface PolicyConfig {
  get<T>(key: string, defaultValue: T): T;
}

export function shouldApplyStartupPolicy(
  globalState: PolicyGlobalState,
  cfg: PolicyConfig
): boolean {
  if (!cfg.get<boolean>("autoApplyPolicyOnFirstRun", true)) {
    return false;
  }
  const firstRunDone = globalState.get<boolean>(GLOBAL_FIRST_RUN_KEY, false);
  const appliedVersion = globalState.get<string>(GLOBAL_POLICY_VERSION_KEY, "");
  return !firstRunDone || appliedVersion !== POLICY_VERSION;
}
