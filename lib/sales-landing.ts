// Where a sales-portal account lands after login. A rep who works their own
// leads goes to the leads screen; a manager-only account (no 'member' row) has
// no personal queue, so they land on the team overview instead. Kept in one
// place so the (dashboard) redirect and any future entry point agree.
export function salesLandingPath(memberships: { role: string }[]): string {
  const hasOwnQueue = memberships.some(m => m.role === "member");
  const isManagerOnly = !hasOwnQueue && memberships.some(m => m.role === "manager");
  return isManagerOnly ? "/sales/team" : "/sales/leads";
}
