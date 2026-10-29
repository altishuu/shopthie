/** Required foundations cannot be disabled by feature configuration. */
export const requiredBackendModules = ["identity", "access", "audit"] as const;

export const backendModuleDependencies = {
  identity: [],
  access: ["identity"],
  audit: ["identity", "access"],
  profiles: ["identity", "access"],
  geography: [],
  addresses: ["profiles", "geography", "access"],
  customer_lookup: ["profiles", "access", "audit"],
  customer_status: ["customer_lookup", "access", "audit"],
  staff: ["profiles", "access", "audit"],
  support: ["staff", "profiles", "audit"],
} as const;

export type BackendModuleId = keyof typeof backendModuleDependencies;

/** Metadata/configuration only: enabling a contract does not implement its service. */
export function resolveBackendModules(optional: readonly string[] = []): BackendModuleId[] {
  const selected = new Set<string>([...requiredBackendModules, ...optional]);
  for (const id of selected) {
    if (!Object.hasOwn(backendModuleDependencies, id)) {
      throw new Error(`Unknown backend module: ${id}`);
    }
    for (const dependency of backendModuleDependencies[id as BackendModuleId]) {
      if (!selected.has(dependency)) throw new Error(`${id} requires ${dependency}`);
    }
  }
  return (Object.keys(backendModuleDependencies) as BackendModuleId[]).filter((id) =>
    selected.has(id),
  );
}
