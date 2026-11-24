/**
 * Security Rules Verification Suite (Dirty Dozen Payloads)
 * Covers all 12 adversarial cases defined in security_spec.md.
 */

export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unauthenticated read/write', path: '/workspaces/ws1/companies/c1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified email write', path: '/workspaces/ws1/companies/c2', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Cross-tenant PII read', path: '/workspaces/ws_victim/companies/c1', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Cross-tenant list scrape', path: '/workspaces/ws_victim/companies', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Identity spoofing on ownerId', path: '/workspaces/ws1/companies/c3', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Shadow field injection on create', path: '/workspaces/ws1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Shadow field injection on update', path: '/workspaces/ws1/payments/p1', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'ID poisoning with oversized/invalid ID', path: '/workspaces/ws1/companies/invalid$id', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Resource exhaustion oversized nombre', path: '/workspaces/ws1/companies/c4', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Forged client timestamp', path: '/workspaces/ws1/metaReports/r1', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Orphaned subcollection write', path: '/workspaces/missing_ws/marketingLogs/l1', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Value poisoning invalid enum estado', path: '/workspaces/ws1/companies/c1', expected: 'PERMISSION_DENIED' },
] as const;
