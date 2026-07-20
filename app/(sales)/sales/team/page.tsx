import { getManagedTeams, getTeamGoalsAndEarnings } from "@/app/actions/sales-manager";
import TeamOverviewClient from "@/components/modules/sales/team/team-overview-client";

export default async function SalesTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team: requestedTeamId } = await searchParams;
  const { teams, error: teamsError } = await getManagedTeams();

  if (teamsError || teams.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {teamsError ?? "You don't manage any sales team yet."}
        </div>
      </div>
    );
  }

  const activeTeam = teams.find(t => t.id === requestedTeamId) ?? teams[0];
  const { members, totals, error } = await getTeamGoalsAndEarnings(activeTeam.id);

  return (
    <div className="h-full overflow-y-auto p-6">
      <TeamOverviewClient
        key={activeTeam.id}
        teams={teams.map(t => ({ id: t.id, name: t.name }))}
        activeTeamId={activeTeam.id}
        activeTeamName={activeTeam.name}
        members={members}
        totals={totals}
        error={error}
      />
    </div>
  );
}
