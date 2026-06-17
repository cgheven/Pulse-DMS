// DMS v1 — owner-only. Staff RBAC deferred to v2.
// File kept for structural compatibility; no permission checks needed in v1.

export const PERMISSIONS = {} as const;
export type PermissionKey = never;

export function hasPermission(_perms: string[] | null | undefined, _key: PermissionKey): boolean {
  return false;
}
