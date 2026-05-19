import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthRange, formatDateInput } from "@/lib/utils";
import type {
  Profile, Gym, Member, MembershipPlan, Payment, Issue, Announcement,
  Expense, Bill, Staff, StaffRole, SalaryPayment, CheckIn, GymClass,
  DashboardStats, DashboardMember, RevenueMonth, AgingBucket, TrainerStat,
  MemberGoal, GoalProgressEntry, BodyMetric, MetricSkip, Lead, LeadActivity,
  Referrer, SocialManager, SocialLead, TrainerReportRow, TrainerFlowRow, MemberReportSummary,
  DefaulterRow, PlanDistributionRow,
  InventoryItem, InventoryBatch, InventorySale, InventoryProfitSummary,
  InventoryTopSeller, InventoryDeadStockItem, InventoryExpiringBatch,
} from "@/types";

export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  // NEVER cache auth.getUser() — JWT verification must always run.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const activeGymId = cookieStore.get("pulse_active_gym")?.value;

  // Per-user CACHED profile lookup — 5 min TTL, tagged per user for revalidation.
  // Use admin client because unstable_cache callbacks run outside the request scope
  // and don't have access to per-request cookies.
  const profile = await unstable_cache(
    async (uid: string) => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("pulse_profiles").select("*").eq("id", uid).single();
      return data as (Profile & { is_demo?: boolean; demo_gym_id?: string }) | null;
    },
    ["auth-profile", user.id],
    { revalidate: 300, tags: [`profile-${user.id}`] }
  )(user.id);

  const p = profile;
  const isDemo = !!p?.is_demo;

  let gyms: Gym[];
  let gym: Gym | null;

  if (isDemo && p?.demo_gym_id) {
    // Demo user: load the gym they're pointed at using the admin client (bypasses owner RLS)
    const admin = createAdminClient();
    const { data: demoGym } = await admin
      .from("pulse_gyms").select("*").eq("id", p.demo_gym_id).single();
    gym = (demoGym as Gym | null);
    gyms = gym ? [gym] : [];
  } else {
    // Per-user CACHED owner-gyms lookup — 5 min TTL, tagged per owner.
    gyms = await unstable_cache(
      async (uid: string) => {
        const admin = createAdminClient();
        const { data } = await admin
          .from("pulse_gyms").select("*").eq("owner_id", uid).order("created_at");
        return (data ?? []) as Gym[];
      },
      ["auth-gyms", user.id],
      { revalidate: 300, tags: [`gyms-owner-${user.id}`] }
    )(user.id);
    gym = (activeGymId ? gyms.find((g) => g.id === activeGymId) : null) ?? gyms[0] ?? null;
  }

  return {
    supabase,
    user,
    profile: profile as Profile | null,
    gym,
    gyms,
    gymId: (gym?.id ?? null) as string | null,
    isDemo,
  };
});

async function _fetchDashboard(gymId: string, gym: Gym | null) {
  const supabase = createAdminClient();
  const now = new Date();
  const { start, end } = getMonthRange();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = formatDateInput(now);
  const weekEnd = formatDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

  const ranges = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }),
      monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      start: formatDateInput(new Date(d.getFullYear(), d.getMonth(), 1)),
      end: formatDateInput(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  });

  const [
    membersRes,
    todayCheckinsRes,
    expensesRes,
    salariesRes,
    unpaidBillsRes,
    collectedPaymentsRes,
    allPayments6moRes,
    allExpenses6moRes,
    trainersRes,
    assignedMembersRes,
    currentMonthPaymentsRes,
    goalsRes,
    pendingReferralsRes,
    paidReferralsRes,
    pendingSocialRes,
    paidSocialRes,
    paidBillsRes,
  ] = await Promise.all([
    supabase.from("pulse_members").select("id, full_name, status, monthly_fee, monthly_discount, plan_expiry_date").eq("gym_id", gymId),
    supabase.from("pulse_check_ins").select("id").eq("gym_id", gymId).gte("checked_in_at", `${todayStr}T00:00:00`).lte("checked_in_at", `${todayStr}T23:59:59`),
    supabase.from("pulse_expenses").select("amount").eq("gym_id", gymId).gte("date", start).lte("date", end),
    supabase.from("pulse_salary_payments").select("total_amount").eq("gym_id", gymId).eq("for_month", currentMonthKey).eq("status", "paid"),
    supabase.from("pulse_bills").select("id,gym_id,title,category,amount,late_fee,due_date,paid_date,status,notes,condition,reminder_days,created_at").eq("gym_id", gymId).neq("status", "paid").order("due_date").limit(10),
    supabase.from("pulse_payments").select("total_amount").eq("gym_id", gymId).gte("payment_date", start).lte("payment_date", end).eq("status", "paid"),
    supabase.from("pulse_payments").select("for_period,total_amount,status,payment_date").eq("gym_id", gymId).gte("payment_date", ranges[0].start).lte("payment_date", ranges[5].end),
    supabase.from("pulse_expenses").select("amount,date").eq("gym_id", gymId).gte("date", ranges[0].start).lte("date", ranges[5].end),
    supabase.from("pulse_staff").select("id,full_name").eq("gym_id", gymId).eq("status", "active").eq("role", "trainer"),
    supabase.from("pulse_members").select("id,assigned_trainer_id,monthly_fee,monthly_discount").eq("gym_id", gymId).eq("status", "active"),
    supabase.from("pulse_payments").select("member_id,total_amount,status").eq("gym_id", gymId).eq("for_period", currentMonthKey),
    supabase.from("pulse_member_goals")
      .select("id,member_id,trainer_id,title,category,unit,start_value,target_value,current_value,direction,status,start_date,target_date,updated_at,member:pulse_members(full_name,assigned_trainer_id),trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .order("updated_at", { ascending: false }),
    supabase.from("pulse_referrals").select("commission_amount").eq("gym_id", gymId).eq("status", "pending"),
    supabase.from("pulse_referrals").select("commission_amount").eq("gym_id", gymId).eq("status", "paid").gte("paid_at", start).lte("paid_at", end),
    supabase.from("pulse_social_leads").select("commission_amount").eq("gym_id", gymId).in("status", ["pending_review", "pending_payment"]),
    supabase.from("pulse_social_leads").select("commission_amount").eq("gym_id", gymId).eq("status", "paid").gte("paid_at", start).lte("paid_at", end),
    supabase.from("pulse_bills").select("amount,late_fee").eq("gym_id", gymId).eq("status", "paid").gte("paid_date", start).lte("paid_date", end),
  ]);

  const members = membersRes.data ?? [];
  const activeMembers = members.filter((m) => m.status === "active");
  const expiredMembers = members.filter((m) => m.status === "expired");
  const frozenMembers = members.filter((m) => m.status === "frozen");
  const expiringThisWeek = members.filter(
    (m) => m.status === "active" && m.plan_expiry_date && m.plan_expiry_date >= todayStr && m.plan_expiry_date <= weekEnd
  ).map((m) => ({
    id: m.id,
    name: m.full_name as string,
    plan_expiry_date: m.plan_expiry_date as string,
    days_left: Math.ceil((new Date(m.plan_expiry_date!).getTime() - new Date(todayStr).getTime()) / 86400000),
  })).sort((a, b) => a.days_left - b.days_left);

  const monthlyExpenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const monthlySalaries = (salariesRes.data ?? []).reduce((s, e) => s + Number(e.total_amount), 0);
  const monthlyCollected = (collectedPaymentsRes.data ?? []).reduce((s, e) => s + Number(e.total_amount), 0);
  const monthlyPaidBills = (paidBillsRes.data ?? []).reduce((s, b) => s + Number(b.amount) + Number(b.late_fee), 0);

  const unpaidBills = unpaidBillsRes.data ?? [];
  // Realized revenue = sticker fee minus recurring discount per member.
  const monthlyRevenue = activeMembers.reduce(
    (s, m) => s + Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
    0,
  );

  // Outstanding = net expected (sticker − discount) − paid for the current period.
  // Uses currentMonthPayments (filtered by for_period = currentMonthKey) so admission payments don't count.
  const currentMonthPayments = currentMonthPaymentsRes.data ?? [];
  const paidByMemberThisMonth = new Map<string, number>();
  for (const p of currentMonthPayments) {
    if (p.status === "paid" && p.member_id) {
      paidByMemberThisMonth.set(p.member_id, (paidByMemberThisMonth.get(p.member_id) ?? 0) + Number(p.total_amount));
    }
  }
  const overdueMembers: DashboardMember[] = activeMembers
    .map((m) => {
      const fee = Number(m.monthly_fee);
      const discount = Number((m as { monthly_discount?: number }).monthly_discount ?? 0);
      const expected = Math.max(0, fee - discount);
      const paid = paidByMemberThisMonth.get(m.id) ?? 0;
      const owed = Math.max(0, expected - paid);
      return { id: m.id, name: m.full_name as string, amount: owed, status: "overdue" };
    })
    .filter((x) => x.amount > 0);
  const monthlyOutstanding = overdueMembers.reduce((s, x) => s + x.amount, 0);

  const allPayments6mo = allPayments6moRes.data ?? [];
  const allExpenses6mo = allExpenses6moRes.data ?? [];

  const monthlyData = ranges.map(({ month, start: s, end: e }) => ({
    month,
    collected: allPayments6mo.filter((p) => p.payment_date && p.payment_date >= s && p.payment_date <= e && p.status === "paid").reduce((sum, p) => sum + Number(p.total_amount), 0),
    expenses: allExpenses6mo.filter((x) => x.date >= s && x.date <= e).reduce((sum, x) => sum + Number(x.amount), 0),
  }));

  const stats: DashboardStats = {
    total_members: members.length,
    active_members: activeMembers.length,
    expired_members: expiredMembers.length,
    frozen_members: frozenMembers.length,
    todays_checkins: todayCheckinsRes.data?.length ?? 0,
    monthly_revenue: monthlyRevenue,
    monthly_collected: monthlyCollected,
    monthly_outstanding: monthlyOutstanding,
    monthly_expenses: monthlyExpenses,
    monthly_salaries: monthlySalaries,
    monthly_paid_bills: monthlyPaidBills,
    net_profit: monthlyCollected - monthlyExpenses - monthlySalaries - monthlyPaidBills,
    unpaid_bills: unpaidBills.length,
    unpaid_bills_amount: unpaidBills.reduce((s, b) => s + Number(b.amount) + Number(b.late_fee), 0),
    expiring_this_week: expiringThisWeek.length,
    revenue_target: gym?.monthly_revenue_target ?? 0,
    pending_commissions_amount: (pendingReferralsRes.data ?? []).reduce((s, r) => s + Number(r.commission_amount), 0),
    pending_commissions_count: pendingReferralsRes.data?.length ?? 0,
    paid_commissions_this_month: (paidReferralsRes.data ?? []).reduce((s, r) => s + Number(r.commission_amount), 0),
    pending_social_commissions_amount: (pendingSocialRes.data ?? []).reduce((s, r) => s + Number(r.commission_amount), 0),
    pending_social_commissions_count: pendingSocialRes.data?.length ?? 0,
    paid_social_commissions_this_month: (paidSocialRes.data ?? []).reduce((s, r) => s + Number(r.commission_amount), 0),
  };
  // Recalculate net profit to include paid partner + social commissions this month
  stats.net_profit = stats.monthly_collected - stats.monthly_expenses - stats.monthly_salaries - stats.monthly_paid_bills - stats.paid_commissions_this_month - stats.paid_social_commissions_this_month;

  const trainers = trainersRes.data ?? [];
  const assignedMembers = assignedMembersRes.data ?? [];

  const trainerStats: TrainerStat[] = trainers.map((t) => {
    const myMembers = assignedMembers.filter((m) => m.assigned_trainer_id === t.id);
    const myMemberIds = new Set(myMembers.map((m) => m.id));
    const myPayments = currentMonthPayments.filter((p) => p.member_id && myMemberIds.has(p.member_id));
    const paidIds = new Set(myPayments.filter((p) => p.status === "paid").map((p) => p.member_id));
    const collected = myPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
    const totalDue = myMembers.reduce(
      (s, m) => s + Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
      0,
    );
    return {
      id: t.id,
      name: t.full_name,
      total: myMembers.length,
      paid: paidIds.size,
      unpaid: myMembers.length - paidIds.size,
      collected,
      totalDue,
      rate: myMembers.length > 0 ? Math.round((paidIds.size / myMembers.length) * 100) : 0,
    };
  });

  const selfMembers = assignedMembers.filter((m) => !m.assigned_trainer_id);
  const selfMemberIds = new Set(selfMembers.map((m) => m.id));
  const selfPayments = currentMonthPayments.filter((p) => p.member_id && selfMemberIds.has(p.member_id));
  const selfPaidIds = new Set(selfPayments.filter((p) => p.status === "paid").map((p) => p.member_id));
  const selfStat: TrainerStat | null = selfMembers.length > 0 ? {
    id: "__self__",
    name: "Self",
    total: selfMembers.length,
    paid: selfPaidIds.size,
    unpaid: selfMembers.length - selfPaidIds.size,
    collected: selfPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0),
    totalDue: selfMembers.reduce(
      (s, m) => s + Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
      0,
    ),
    rate: Math.round((selfPaidIds.size / selfMembers.length) * 100),
  } : null;

  // ── Goals & wins overview ──────────────────────────────────────────────
  type RawGoal = {
    id: string; member_id: string; trainer_id: string | null;
    title: string; category: string; unit: string;
    start_value: number | null; target_value: number; current_value: number | null;
    direction: "down" | "up";
    status: "active" | "achieved" | "paused" | "abandoned";
    start_date: string; target_date: string; updated_at: string;
    member?: { full_name: string; assigned_trainer_id: string | null } | null;
    trainer?: { full_name: string } | null;
  };
  const allGoals = ((goalsRes.data ?? []) as unknown) as RawGoal[];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const recentWins = allGoals
    .filter((g) => g.status === "achieved" && new Date(g.updated_at) >= thirtyDaysAgo)
    .map((g) => ({
      id: g.id,
      memberName: g.member?.full_name ?? "Member",
      trainerId: g.trainer_id,
      trainerName: g.trainer?.full_name ?? "—",
      title: g.title,
      category: g.category,
      unit: g.unit,
      startValue: g.start_value,
      finalValue: g.current_value ?? g.target_value,
      targetValue: g.target_value,
      direction: g.direction,
      startDate: g.start_date,
      achievedAt: g.updated_at,
    }));

  // Pace classification for active goals
  function paceOf(g: RawGoal): "ahead" | "on_track" | "behind" {
    if (g.current_value == null) return "on_track";
    const totalDays = Math.max(1, Math.floor((new Date(g.target_date).getTime() - new Date(g.updated_at).getTime()) / 86400000) + 1);
    const elapsedDays = Math.max(0, Math.floor((Date.now() - (Date.now() - totalDays * 86400000)) / 86400000));
    const timePct = Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));
    // Simple progress estimation (inverse for direction)
    return timePct > 100 ? "behind" : "on_track";
  }

  const activeGoals = allGoals.filter((g) => g.status === "active");
  const achievedThisMonth = allGoals.filter((g) => g.status === "achieved" && new Date(g.updated_at) >= new Date(start)).length;
  const totalAchieved = allGoals.filter((g) => g.status === "achieved").length;

  const goalsByTrainer = trainers.map((t) => {
    const trainerGoals = allGoals.filter((g) => g.trainer_id === t.id);
    const tActive = trainerGoals.filter((g) => g.status === "active").length;
    const tAchieved = trainerGoals.filter((g) => g.status === "achieved").length;
    const tPaused = trainerGoals.filter((g) => g.status === "paused" || g.status === "abandoned").length;
    const total = tActive + tAchieved + tPaused;
    const winRate = total > 0 ? Math.round((tAchieved / total) * 100) : 0;
    const recentAchieved = trainerGoals.filter(
      (g) => g.status === "achieved" && new Date(g.updated_at) >= thirtyDaysAgo
    ).length;
    return {
      id: t.id,
      name: t.full_name,
      activeCount: tActive,
      achievedCount: tAchieved,
      recentAchieved,
      winRate,
    };
  }).sort((a, b) => b.recentAchieved - a.recentAchieved || b.winRate - a.winRate);

  const goalsOverview = {
    activeCount: activeGoals.length,
    achievedThisMonth,
    totalAchieved,
    behindCount: activeGoals.filter((g) => paceOf(g) === "behind").length,
    recentWins,
    byTrainer: goalsByTrainer,
  };

  return { stats, upcomingBills: unpaidBills as Bill[], monthlyData, overdueMembers, trainerStats, selfStat, expiringMembers: expiringThisWeek, goalsOverview };
}

/**
 * Resolve the active gym id for the current request — works for both
 * owner sessions (via getAuthContext) and non-owner staff sessions
 * (via getStaffSession). Used by data fetchers so they keep returning
 * the gym's data when a staff member is logged in instead of the
 * owner.
 *
 * Returns null if the user is unauthenticated or has no gym binding.
 */
export async function resolveActiveGymId(): Promise<string | null> {
  const owner = await getAuthContext();
  if (owner?.gymId) return owner.gymId;
  const staff = await getStaffSession();
  if (staff?.gymId) return staff.gymId;
  return null;
}

export async function getDashboardData() {
  const owner = await getAuthContext();
  let gymId: string | null = owner?.gymId ?? null;
  let gym: Gym | null = owner?.gym ?? null;
  if (!gymId) {
    const staff = await getStaffSession();
    if (staff?.gymId) {
      gymId = staff.gymId;
      const { data } = await createAdminClient()
        .from("pulse_gyms").select("*").eq("id", gymId).single();
      gym = (data ?? null) as Gym | null;
    }
  }
  if (!gymId) return null;
  const finalGymId = gymId;
  const finalGym = gym;
  const data = await unstable_cache(
    () => _fetchDashboard(finalGymId, finalGym),
    ["dashboard", finalGymId],
    { revalidate: 60, tags: [`dashboard-${finalGymId}`] }
  )();
  return { gymId: finalGymId, ...data };
}

async function _fetchMembers(gymId: string) {
  const supabase = createAdminClient();
  const [{ data: members }, { data: plans }, { data: staff }, { data: referrers }, { data: gymData }] = await Promise.all([
    supabase.from("pulse_members")
      .select("*, plan:pulse_membership_plans(name,duration_type,price,color), trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false }),
    supabase.from("pulse_membership_plans").select("*").eq("gym_id", gymId).eq("is_active", true).order("name"),
    supabase.from("pulse_staff").select("id,full_name,role,commission_percentage,commission_floor").eq("gym_id", gymId).eq("status", "active").eq("role", "trainer"),
    supabase.from("pulse_referrers").select("id,full_name,commission_type,commission_value").eq("gym_id", gymId).eq("status", "active").order("full_name"),
    supabase.from("pulse_gyms").select("compliance_settings").eq("id", gymId).single(),
  ]);

  const threshold = Math.max(1, Math.min(6, (gymData?.compliance_settings as Record<string, unknown> | null)?.defaulter_threshold_months as number ?? 2));

  // Auto-expire members whose plan_expiry_date has passed
  const { error: expireErr } = await supabase.rpc("auto_expire_members", { p_gym_id: gymId });
  if (expireErr) console.error("[auto_expire_members]", expireErr.message);

  // Auto-mark defaulters based on threshold
  const { error: defaulterErr } = await supabase.rpc("check_defaulters", { p_gym_id: gymId, p_threshold: threshold });
  if (defaulterErr) console.error("[check_defaulters]", defaulterErr.message);

  // Re-fetch after auto-mark so the buckets are accurate
  const { data: freshMembers } = await supabase.from("pulse_members")
    .select("*, plan:pulse_membership_plans(name,duration_type,price,color), trainer:pulse_staff(full_name)")
    .eq("gym_id", gymId)
    .order("created_at", { ascending: false });

  const all = (freshMembers ?? members ?? []) as Member[];
  return {
    active:    all.filter((m) => m.status === "active"),
    frozen:    all.filter((m) => m.status === "frozen"),
    on_hold:   all.filter((m) => m.status === "on_hold"),
    defaulters: all.filter((m) => m.status === "defaulter"),
    expired:   all.filter((m) => m.status === "expired" || m.status === "cancelled"),
    defaulterThreshold: threshold,
    plans:     (plans ?? []) as MembershipPlan[],
    staff:     (staff ?? []) as Pick<Staff, "id" | "full_name" | "role" | "commission_percentage" | "commission_floor">[],
    referrers: (referrers ?? []) as Pick<Referrer, "id" | "full_name" | "commission_type" | "commission_value">[],
  };
}

export async function getMembers() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, active: [], frozen: [], on_hold: [], defaulters: [], expired: [], defaulterThreshold: 2, plans: [], staff: [], referrers: [] };
  const data = await _fetchMembers(gymId);
  return { gymId, ...data };
}

async function _fetchMembershipPlans(gymId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase.from("pulse_membership_plans").select("*").eq("gym_id", gymId).order("price");
  return { plans: (data as MembershipPlan[]) ?? [] };
}

export async function getMembershipPlans() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, plans: [] };
  const data = await unstable_cache(
    () => _fetchMembershipPlans(gymId),
    ["plans", gymId],
    { revalidate: 60, tags: [`plans-${gymId}`] }
  )();
  return { gymId, ...data };
}

async function _fetchPayments(gymId: string) {
  const supabase = createAdminClient();
  const [{ data: payments }, { data: members }, { data: plans }] = await Promise.all([
    supabase.from("pulse_payments")
      .select("*, member:pulse_members(full_name,plan_id)")
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("pulse_members")
      .select("id,full_name,member_number,phone,monthly_fee,monthly_discount,plan_id,assigned_trainer_id,status,plan_expiry_date,outstanding_balance,plan:pulse_membership_plans(name),trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("full_name"),
    supabase.from("pulse_membership_plans")
      .select("id,name,price,duration_type")
      .eq("gym_id", gymId)
      .eq("is_active", true),
  ]);
  return {
    payments: (payments ?? []) as Payment[],
    members: (members ?? []) as unknown as (Pick<Member, "id" | "full_name" | "member_number" | "phone" | "monthly_fee" | "monthly_discount" | "plan_id" | "assigned_trainer_id" | "status" | "plan_expiry_date" | "outstanding_balance"> & { plan?: { name: string } | null; trainer?: { full_name: string } | null })[],
    plans: (plans ?? []) as Pick<MembershipPlan, "id" | "name" | "price" | "duration_type">[],
  };
}

export async function getPaymentsData() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, payments: [], members: [], plans: [] };
  const data = await unstable_cache(
    () => _fetchPayments(gymId),
    ["payments", gymId],
    { revalidate: 5, tags: [`payments-${gymId}`] }
  )();
  return { gymId, ...data };
}

export const getTrainerContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("pulse_profiles")
    .select("role, is_admin, is_demo")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "trainer") return null;

  const { data: staff } = await supabase
    .from("pulse_staff")
    .select("*, gym:pulse_gyms(name,reminder_template,payment_methods)")
    .eq("user_id", user.id)
    .single();

  if (!staff) return null;

  return {
    supabase,
    user,
    profile,
    staff: staff as Staff & { gym?: { name: string } | null },
    gymId: staff.gym_id as string,
    isDemo: !!(profile as { is_demo?: boolean } | null)?.is_demo,
  };
});

/**
 * Resolve a generic staff session for the current user — works for ANY
 * non-owner, non-trainer role (frontdesk, manager, cleaner, guard,
 * cook, other). Trainers also resolve here, but trainer-specific
 * flows should keep using getTrainerContext for back-compat.
 *
 * Returns null if the user is not logged in or has no active staff
 * record. Owners typically have no staff row, so this returns null
 * for them — owner flows must use getAuthContext / requireOwner.
 *
 * The returned `permissions` array is the additive RBAC layer
 * (see lib/permissions.ts). Empty array means "fall back to legacy
 * role + can_add_members behavior".
 */
export const getStaffSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use admin client to bypass RLS — staff records may not be visible
  // to the user via owner-scoped policies, but we've already verified
  // the auth user above so it's safe to look up their own staff row.
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("pulse_staff")
    .select("id, gym_id, full_name, role, can_add_members, permissions, status, gym:pulse_gyms(name, owner_id)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!staff) return null;

  const s = staff as unknown as {
    id: string;
    gym_id: string;
    full_name: string;
    role: StaffRole;
    can_add_members: boolean | null;
    permissions: string[] | null;
    gym: { name: string; owner_id: string } | null;
  };

  return {
    user,
    staffId: s.id,
    gymId: s.gym_id,
    fullName: s.full_name,
    role: s.role,
    canAddMembers: !!s.can_add_members,
    permissions: (s.permissions ?? []) as string[],
    gymName: s.gym?.name ?? "",
  };
});

export async function getTrainerPageData() {
  const ctx = await getTrainerContext();
  if (!ctx) return null;
  const { supabase, staff, gymId } = ctx;

  const [{ data: members }, { data: plans }, { data: trainers }] = await Promise.all([
    supabase
      .from("pulse_members")
      .select("id,full_name,member_number,phone,email,cnic,gender,date_of_birth,emergency_contact,address,monthly_fee,monthly_discount,admission_fee,plan_id,assigned_trainer_id,assigned_shift_id,status,plan_expiry_date,outstanding_balance,join_date,notes,plan:pulse_membership_plans(name)")
      .eq("assigned_trainer_id", staff.id)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("pulse_membership_plans")
      .select("id,name,price,duration_type,admission_fee")
      .eq("gym_id", gymId)
      .eq("is_active", true),
    supabase
      .from("pulse_staff")
      .select("id,full_name")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .eq("role", "trainer")
      .order("full_name"),
  ]);

  // SELF clients (no assigned trainer) — only fetched if trainer has onboarding permission.
  // Trainers with this permission help walk-ins / handle payments when owner is absent.
  // Uses admin client because RLS restricts trainer SELECT to their own assigned members,
  // which would filter out null-trainer rows. Permission check above gates access.
  const selfRes = staff.can_add_members
    ? await createAdminClient()
        .from("pulse_members")
        .select("id,full_name,member_number,phone,email,cnic,gender,date_of_birth,emergency_contact,address,monthly_fee,monthly_discount,admission_fee,plan_id,assigned_trainer_id,assigned_shift_id,status,plan_expiry_date,outstanding_balance,join_date,notes,plan:pulse_membership_plans(name)")
        .eq("gym_id", gymId)
        .eq("status", "active")
        .is("assigned_trainer_id", null)
        .order("full_name")
    : { data: [] };

  const ownIds = (members ?? []).map((m) => m.id);
  const selfIds = (selfRes.data ?? []).map((m) => m.id);
  const allIds = [...ownIds, ...selfIds];
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  // Payments via admin client: trainer's RLS only allows SELECT for own assigned members,
  // which would hide SELF clients' payments. Query is already bounded to member IDs we just fetched.
  const admin = createAdminClient();
  const [paymentsRes, todayCheckInsRes] = await Promise.all([
    allIds.length
      ? admin
          .from("pulse_payments")
          .select("*, member:pulse_members(full_name,plan_id)")
          .in("member_id", allIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    ownIds.length
      ? supabase
          .from("pulse_check_ins")
          .select("member_id")
          .in("member_id", ownIds)
          .gte("checked_in_at", dayStart)
      : Promise.resolve({ data: [] }),
  ]);

  const checkedInToday = ((todayCheckInsRes.data ?? []) as { member_id: string }[]).map((r) => r.member_id);

  // Goals + last 12 progress entries per goal for the trainer's PT members.
  // Admin client because goals RLS for trainer requires JWT-derived staff id resolution
  // that's already validated above via getTrainerContext + assignment check.
  const goalsRes = ownIds.length
    ? await admin
        .from("pulse_member_goals")
        .select("*")
        .in("member_id", ownIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const goalIds = ((goalsRes.data ?? []) as { id: string }[]).map((g) => g.id);
  const [progressRes, metricsRes, skipsRes] = await Promise.all([
    goalIds.length
      ? admin.from("pulse_goal_progress").select("*").in("goal_id", goalIds).order("recorded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    ownIds.length
      ? admin.from("pulse_body_metrics").select("*").in("member_id", ownIds).order("measurement_date", { ascending: false })
      : Promise.resolve({ data: [] }),
    ownIds.length
      ? admin.from("pulse_metric_skips").select("*").in("member_id", ownIds).order("week_start", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const progressByGoal: Record<string, GoalProgressEntry[]> = {};
  for (const p of (progressRes.data ?? []) as GoalProgressEntry[]) {
    (progressByGoal[p.goal_id] ??= []).push(p);
  }
  const goals: MemberGoal[] = ((goalsRes.data ?? []) as MemberGoal[]).map((g) => ({
    ...g,
    progress: (progressByGoal[g.id] ?? []).slice(0, 12),
  }));

  const bodyMetrics = (metricsRes.data ?? []) as BodyMetric[];
  const metricSkips = (skipsRes.data ?? []) as MetricSkip[];

  const { data: gymData } = await createAdminClient()
    .from("pulse_gyms")
    .select("name,reminder_template,payment_methods")
    .eq("id", gymId)
    .single();

  return {
    staff: ctx.staff,
    gymId,
    gymName: gymData?.name ?? "",
    reminderTemplate: gymData?.reminder_template ?? null,
    paymentMethods: (gymData?.payment_methods ?? []) as import("@/types").PaymentMethodAccount[],
    members: (members ?? []) as unknown as (Pick<Member, "id" | "full_name" | "member_number" | "phone" | "email" | "cnic" | "gender" | "date_of_birth" | "emergency_contact" | "address" | "monthly_fee" | "monthly_discount" | "admission_fee" | "plan_id" | "assigned_trainer_id" | "assigned_shift_id" | "status" | "plan_expiry_date" | "outstanding_balance" | "join_date" | "notes"> & { plan?: { name: string } | null })[],
    selfMembers: (selfRes.data ?? []) as unknown as (Pick<Member, "id" | "full_name" | "member_number" | "phone" | "email" | "cnic" | "gender" | "date_of_birth" | "emergency_contact" | "address" | "monthly_fee" | "monthly_discount" | "admission_fee" | "plan_id" | "assigned_trainer_id" | "assigned_shift_id" | "status" | "plan_expiry_date" | "outstanding_balance" | "join_date" | "notes"> & { plan?: { name: string } | null })[],
    payments: (paymentsRes.data ?? []) as Payment[],
    plans: (plans ?? []) as Pick<MembershipPlan, "id" | "name" | "price" | "duration_type" | "admission_fee">[],
    trainers: (trainers ?? []) as Pick<Staff, "id" | "full_name">[],
    checkedInToday,
    goals,
    bodyMetrics,
    metricSkips,
  };
}

export async function getCheckIns() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, checkIns: [], members: [], unlinked: [] };
  // Use admin client so this works for both owner and staff sessions —
  // staff RLS doesn't grant SELECT on these tables.
  const supabase = createAdminClient();

  const today = formatDateInput(new Date());
  const [{ data: checkIns }, { data: members }, { data: unlinked }] = await Promise.all([
    supabase.from("pulse_check_ins")
      .select("*, member:pulse_members(full_name,photo_url,member_number,status,plan_expiry_date,outstanding_balance,assigned_trainer_id,trainer:pulse_staff(full_name))")
      .eq("gym_id", gymId)
      .gte("checked_in_at", `${today}T00:00:00`)
      .order("checked_in_at", { ascending: false }),
    supabase.from("pulse_members")
      .select("id,full_name,member_number,photo_url,status,plan_expiry_date,assigned_trainer_id,trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("full_name")
      .limit(500),
    supabase.from("pulse_unlinked_punches")
      .select("id,device_user_id,device_serial,punched_at")
      .eq("gym_id", gymId)
      .order("punched_at", { ascending: false }),
  ]);

  return {
    gymId,
    checkIns: (checkIns ?? []) as CheckIn[],
    members: (members ?? []) as Pick<Member, "id" | "full_name" | "member_number" | "photo_url" | "status" | "plan_expiry_date">[],
    unlinked: (unlinked ?? []) as { id: string; device_user_id: string; device_serial: string; punched_at: string }[],
  };
}

export async function getClasses() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, classes: [], staff: [] };
  const { supabase, gymId } = ctx;

  const [{ data: classes }, { data: staff }] = await Promise.all([
    supabase.from("pulse_classes")
      .select("*, trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .order("name"),
    supabase.from("pulse_staff").select("id,full_name").eq("gym_id", gymId).eq("status", "active"),
  ]);

  return {
    gymId,
    classes: (classes ?? []) as GymClass[],
    staff: (staff ?? []) as Pick<Staff, "id" | "full_name">[],
  };
}

async function _fetchStaffData(gymId: string) {
  const supabase = createAdminClient();
  const [{ data: staff }, { data: salaryPayments }, { data: gym }] = await Promise.all([
    supabase.from("pulse_staff").select("*").eq("gym_id", gymId).order("full_name"),
    supabase.from("pulse_salary_payments")
      .select("*, staff:pulse_staff(full_name,role)")
      .eq("gym_id", gymId)
      .order("for_month", { ascending: false })
      .limit(200),
    supabase.from("pulse_gyms").select("name").eq("id", gymId).single(),
  ]);
  return {
    staff: (staff ?? []) as Staff[],
    salaryPayments: (salaryPayments ?? []) as SalaryPayment[],
    gymName: gym?.name ?? null,
  };
}

export async function getStaffData() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, staff: [], salaryPayments: [], gymName: null };
  const data = await _fetchStaffData(ctx.gymId);
  return { gymId: ctx.gymId, ...data };
}

// ── Referrers ─────────────────────────────────────────────────────────────────

export async function getReferrersData() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, gymName: null, referrers: [], referrals: [] };
  const admin = createAdminClient();
  const [{ data: referrers }, { data: referrals }] = await Promise.all([
    admin.from("pulse_referrers").select("*").eq("gym_id", ctx.gymId).order("full_name"),
    admin.from("pulse_referrals")
      .select("*, member:pulse_members(full_name, phone, join_date)")
      .eq("gym_id", ctx.gymId)
      .order("created_at", { ascending: false }),
  ]);
  return { gymId: ctx.gymId, gymName: ctx.gym?.name ?? null, referrers: referrers ?? [], referrals: referrals ?? [] };
}

export const getReferrerContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("pulse_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "referrer") return null;
  const { data: referrer } = await supabase
    .from("pulse_referrers")
    .select("*, gym:pulse_gyms(name)")
    .eq("user_id", user.id)
    .single();
  if (!referrer) return null;
  return { supabase, user, referrer };
});

export async function getReferrerPageData() {
  const ctx = await getReferrerContext();
  if (!ctx) return null;
  const admin = createAdminClient();
  const { data: referrals } = await admin
    .from("pulse_referrals")
    .select("*, member:pulse_members(full_name, phone, join_date)")
    .eq("referrer_id", ctx.referrer.id)
    .order("created_at", { ascending: false });
  return { referrer: ctx.referrer, referrals: referrals ?? [] };
}

// ── Social Media Managers ─────────────────────────────────────────────────────

export async function getSocialManagersData() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, gymName: null, managers: [], leads: [] };
  const admin = createAdminClient();
  const { error: expireErr } = await admin.rpc("expire_social_leads", { p_gym_id: ctx.gymId });
  if (expireErr) console.error("[expire_social_leads]", expireErr.message);
  const [{ data: managers }, { data: leads }] = await Promise.all([
    admin.from("pulse_social_managers").select("*").eq("gym_id", ctx.gymId).order("full_name"),
    admin.from("pulse_social_leads")
      .select("*, manager:pulse_social_managers(full_name), member:pulse_members(full_name, phone, join_date)")
      .eq("gym_id", ctx.gymId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    gymId: ctx.gymId,
    gymName: ctx.gym?.name ?? null,
    managers: (managers ?? []) as SocialManager[],
    leads: (leads ?? []) as SocialLead[],
  };
}

export const getSocialManagerContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("pulse_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "social_manager") return null;
  const admin = createAdminClient();
  const { data: manager } = await admin
    .from("pulse_social_managers")
    .select("*, gym:pulse_gyms(name)")
    .eq("user_id", user.id)
    .single();
  if (!manager) return null;
  return { user, manager };
});

export async function getSocialManagerPageData() {
  const ctx = await getSocialManagerContext();
  if (!ctx) return null;
  const admin = createAdminClient();
  const { error: expireErr } = await admin.rpc("expire_social_leads", { p_gym_id: ctx.manager.gym_id });
  if (expireErr) console.error("[expire_social_leads]", expireErr.message);
  const { data: leads } = await admin
    .from("pulse_social_leads")
    .select("*, member:pulse_members(full_name, phone, join_date)")
    .eq("manager_id", ctx.manager.id)
    .order("created_at", { ascending: false });
  return { manager: ctx.manager, leads: (leads ?? []) as SocialLead[] };
}

export async function getUnmatchedSocialLeads(gymId: string) {
  const admin = createAdminClient();
  const { error: expireErr } = await admin.rpc("expire_social_leads", { p_gym_id: gymId });
  if (expireErr) console.error("[expire_social_leads]", expireErr.message);
  const { data } = await admin
    .from("pulse_social_leads")
    .select("id, lead_name, lead_phone, lead_social_handle, platform, evidence_url, notes, expires_at, created_at, manager:pulse_social_managers(full_name)")
    .eq("gym_id", gymId)
    .eq("status", "unmatched")
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as (Pick<SocialLead, "id" | "lead_name" | "lead_phone" | "lead_social_handle" | "platform" | "evidence_url" | "notes" | "expires_at" | "created_at"> & { manager: { full_name: string } | null })[];
}

export async function getExpenses(monthFilter: string) {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, expenses: [] };
  const supabase = createAdminClient();
  const [year, month] = monthFilter.split("-");
  const start = `${year}-${month}-01`;
  const end = formatDateInput(new Date(parseInt(year), parseInt(month), 0));
  const { data } = await supabase.from("pulse_expenses").select("*").eq("gym_id", gymId).gte("date", start).lte("date", end).order("date", { ascending: false });
  return { gymId, expenses: (data as Expense[]) ?? [] };
}

export async function getBills() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, bills: [] };
  const supabase = createAdminClient();
  const { data } = await supabase.from("pulse_bills").select("id,gym_id,title,category,amount,late_fee,due_date,paid_date,status,notes,condition,reminder_days,created_at").eq("gym_id", gymId).order("due_date", { ascending: false });
  return { gymId, bills: (data as Bill[]) ?? [] };
}

export async function getIssues() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, issues: [], members: [] };
  const { supabase, gymId } = ctx;

  const [{ data: issues }, { data: members }] = await Promise.all([
    supabase.from("pulse_issues")
      .select("*, member:pulse_members(full_name)")
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false }),
    supabase.from("pulse_members")
      .select("id,full_name")
      .eq("gym_id", gymId)
      .eq("status", "active"),
  ]);

  return {
    gymId,
    issues: (issues ?? []) as Issue[],
    members: (members ?? []) as Pick<Member, "id" | "full_name">[],
  };
}

export async function getAnnouncements() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { gymId: null, announcements: [] };
  const { supabase, gymId } = ctx;

  const { data } = await supabase
    .from("pulse_announcements")
    .select("*")
    .eq("gym_id", gymId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return { gymId, announcements: (data ?? []) as Announcement[] };
}

async function _fetchReports(gymId: string) {
  const supabase = createAdminClient();
  const now = new Date();
  const ranges = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      monthKey,
      start: formatDateInput(new Date(d.getFullYear(), d.getMonth(), 1)),
      end: formatDateInput(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  });

  // Bound queries to the 12-month report window so they don't grow unbounded.
  const windowStart = ranges[0].start;
  const windowEnd = ranges[11].end;
  const currentMonthKey = ranges[11].monthKey;
  const today    = formatDateInput(now);
  const in7Days  = formatDateInput(new Date(now.getTime() +  7 * 86400000));
  const in15Days = formatDateInput(new Date(now.getTime() + 15 * 86400000));
  const in30Days = formatDateInput(new Date(now.getTime() + 30 * 86400000));

  const [paymentsRes, expensesRes, membersRes, salariesRes, trainersRes, currentSalariesRes, shiftsRes, plansRes] = await Promise.all([
    supabase.from("pulse_payments").select("payment_date,total_amount,status")
      .eq("gym_id", gymId)
      .gte("payment_date", windowStart)
      .lte("payment_date", windowEnd),
    supabase.from("pulse_expenses").select("amount,date")
      .eq("gym_id", gymId)
      .gte("date", windowStart)
      .lte("date", windowEnd),
    supabase.from("pulse_members")
      .select("id,full_name,phone,status,monthly_fee,monthly_discount,assigned_trainer_id,assigned_shift_id,join_date,plan_expiry_date,plan_id,defaulter_since")
      .eq("gym_id", gymId),
    supabase.from("pulse_salary_payments").select("for_month,total_amount,status")
      .eq("gym_id", gymId)
      .gte("for_month", ranges[0].monthKey)
      .lte("for_month", ranges[11].monthKey),
    supabase.from("pulse_staff")
      .select("id,full_name,monthly_salary,commission_percentage,commission_floor")
      .eq("gym_id", gymId)
      .eq("role", "trainer")
      .eq("status", "active"),
    supabase.from("pulse_salary_payments")
      .select("staff_id,base_salary,commission_amount,total_amount,status")
      .eq("gym_id", gymId)
      .eq("for_month", currentMonthKey),
    supabase.from("pulse_trainer_shifts")
      .select("id,staff_id,commission_type,commission_value")
      .eq("gym_id", gymId),
    supabase.from("pulse_membership_plans")
      .select("id,name")
      .eq("gym_id", gymId),
  ]);

  const payments = paymentsRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const members = membersRes.data ?? [];
  const salaries = salariesRes.data ?? [];
  const trainers = trainersRes.data ?? [];
  const currentSalaries = currentSalariesRes.data ?? [];
  const shiftMap = Object.fromEntries(
    (shiftsRes.data ?? []).map((s) => [s.id, s as { id: string; staff_id: string; commission_type: string; commission_value: number }])
  );

  const revenueByMonth: RevenueMonth[] = ranges.map(({ month, monthKey, start, end }) => {
    const monthPayments = payments.filter((p) => p.payment_date && p.payment_date >= start && p.payment_date <= end);
    const collected = monthPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
    const due = monthPayments.reduce((s, p) => s + Number(p.total_amount), 0);
    const exp = expenses.filter((e) => e.date >= start && e.date <= end).reduce((s, e) => s + Number(e.amount), 0);
    const sal = salaries.filter((s) => s.for_month === monthKey && s.status === "paid").reduce((sum, s) => sum + Number(s.total_amount), 0);
    const newMembers = members.filter((m) => m.join_date >= start && m.join_date <= end).length;
    const cancelledMembers = members.filter((m) => m.plan_expiry_date && m.plan_expiry_date >= start && m.plan_expiry_date <= end && m.status !== "active").length;
    const activeMembers = members.filter((m) => m.join_date <= end && (!m.plan_expiry_date || m.plan_expiry_date >= start)).length;
    return {
      month, monthKey, collected, due,
      expenses: exp + sal,
      salaries: sal,
      profit: collected - exp - sal,
      collectionRate: due > 0 ? Math.round((collected / due) * 100) : 0,
      newMembers,
      cancelledMembers,
      activeMembers,
    };
  });

  const overduePayments = payments.filter((p) => p.status === "pending" || p.status === "overdue");
  const aging: { d30: AgingBucket; d60: AgingBucket; d90: AgingBucket; d90plus: AgingBucket } = {
    d30: { count: 0, amount: 0 },
    d60: { count: 0, amount: 0 },
    d90: { count: 0, amount: 0 },
    d90plus: { count: 0, amount: 0 },
  };

  overduePayments.forEach((p) => {
    if (!p.payment_date) return;
    const days = Math.floor((new Date(today).getTime() - new Date(p.payment_date).getTime()) / 86400000);
    const amt = Number(p.total_amount);
    if (days <= 30)        { aging.d30.count++;    aging.d30.amount += amt; }
    else if (days <= 60)   { aging.d60.count++;    aging.d60.amount += amt; }
    else if (days <= 90)   { aging.d90.count++;    aging.d90.amount += amt; }
    else                   { aging.d90plus.count++; aging.d90plus.amount += amt; }
  });

  // ── Trainer report rows ────────────────────────────────
  const trainerRows: TrainerReportRow[] = trainers.map((t) => {
    const activeM = members.filter((m) => m.assigned_trainer_id === t.id && m.status === "active");
    // monthlyFeeGenerated = realized revenue this trainer drives (net of discount).
    const monthlyFeeGenerated = activeM.reduce(
      (s, m) => s + Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
      0,
    );
    const salaryRecord = currentSalaries.find((s) => s.staff_id === t.id);
    const baseSalary = salaryRecord ? Number(salaryRecord.base_salary) : Number(t.monthly_salary);
    // If salary has been generated use the stored commission_amount (exact).
    // Otherwise compute an estimate using the same algorithm as salary generation:
    // commission floor → discount split → shift override → default commission %.
    const commissionEarned = salaryRecord
      ? Number(salaryRecord.commission_amount)
      : activeM.reduce((sum, m) => {
          const fee = Number(m.monthly_fee);
          const discount = Number((m as { monthly_discount?: number }).monthly_discount ?? 0);
          const commissionFloor = Number(t.commission_floor ?? 0);
          const commissionPct = Number(t.commission_percentage ?? 0);
          // Discount split equally between gym floor and trainer base.
          const netFee = Math.max(0, fee - commissionFloor - discount / 2);
          const shift = (m as { assigned_shift_id?: string | null }).assigned_shift_id
            ? shiftMap[(m as { assigned_shift_id?: string }).assigned_shift_id!]
            : null;
          if (shift) {
            return sum + (shift.commission_type === "flat"
              ? shift.commission_value
              : Math.round(netFee * shift.commission_value / 100));
          }
          return sum + (commissionPct > 0
            ? Math.round(netFee * commissionPct / 100)
            : 0);
        }, 0);
    const totalCost = baseSalary + commissionEarned;
    return {
      id: t.id,
      name: t.full_name,
      activeMembers: activeM.length,
      monthlyFeeGenerated,
      baseSalary,
      commissionEarned,
      totalCost,
      netContribution: monthlyFeeGenerated - totalCost,
      salaryGenerated: !!salaryRecord,
    };
  }).sort((a, b) => b.netContribution - a.netContribution);

  // ── Trainer member flow (gained/lost per month) ────────
  const CHURN_STATUSES = ["expired", "cancelled", "defaulter"];
  const trainerFlow: TrainerFlowRow[] = trainers.map((t) => {
    const months = ranges.map(({ month, monthKey, start, end }) => {
      const gained = members.filter(
        (m) => m.assigned_trainer_id === t.id && m.join_date >= start && m.join_date <= end
      ).length;
      const lost = members.filter(
        (m) =>
          m.assigned_trainer_id === t.id &&
          CHURN_STATUSES.includes(m.status) &&
          m.plan_expiry_date &&
          m.plan_expiry_date >= start &&
          m.plan_expiry_date <= end
      ).length;
      return { month, monthKey, gained, lost, net: gained - lost };
    });
    const last6      = months.slice(-6);
    const avgGained  = Math.round(last6.reduce((s, m) => s + m.gained, 0) / 6 * 10) / 10;
    const avgLost    = Math.round(last6.reduce((s, m) => s + m.lost,   0) / 6 * 10) / 10;
    const avgNet     = Math.round((avgGained - avgLost) * 10) / 10;
    return { id: t.id, name: t.full_name, months, avgGained, avgLost, avgNet };
  });

  // ── Member summary ─────────────────────────────────────
  const thisMonthStart = ranges[11].start;
  const lastMonthStart = ranges[10].start;
  const lastMonthEnd   = ranges[10].end;

  const planNameMap = Object.fromEntries((plansRes.data ?? []).map((p) => [p.id, p.name]));
  const activeM = members.filter((m) => m.status === "active");

  const toExpiryRow = (m: typeof members[0]) => ({
    id: m.id,
    name: m.full_name,
    phone: m.phone ?? null,
    planExpiry: m.plan_expiry_date!,
    daysLeft: Math.ceil((new Date(m.plan_expiry_date!).getTime() - new Date(today).getTime()) / 86400000),
  });

  // Plan distribution (active members only, sorted by member count desc).
  // Revenue is net of recurring discount.
  const planBuckets: Record<string, { name: string; count: number; revenue: number }> = {};
  activeM.forEach((m) => {
    const key  = m.plan_id ?? "__none__";
    const name = m.plan_id ? (planNameMap[m.plan_id] ?? "Unknown Plan") : "No Plan";
    if (!planBuckets[key]) planBuckets[key] = { name, count: 0, revenue: 0 };
    planBuckets[key].count   += 1;
    planBuckets[key].revenue += Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0));
  });
  const planDistribution: PlanDistributionRow[] = Object.entries(planBuckets)
    .map(([planId, { name, count, revenue }]) => ({
      planId: planId === "__none__" ? null : planId,
      planName: name,
      memberCount: count,
      percentage: activeM.length > 0 ? Math.round((count / activeM.length) * 100) : 0,
      monthlyRevenue: revenue,
    }))
    .sort((a, b) => b.memberCount - a.memberCount);

  // Defaulter list sorted oldest first
  const defaulterList: DefaulterRow[] = members
    .filter((m) => m.status === "defaulter")
    .map((m) => ({
      id: m.id,
      name: m.full_name,
      phone: m.phone ?? null,
      defaulterSince: (m as { defaulter_since?: string | null }).defaulter_since ?? null,
      monthlyFee: Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
    }))
    .sort((a, b) => (a.defaulterSince ?? "").localeCompare(b.defaulterSince ?? ""));

  const memberSummary: MemberReportSummary = {
    total:        members.length,
    active:       activeM.length,
    frozen:       members.filter((m) => m.status === "frozen" || m.status === "on_hold").length,
    defaulters:   members.filter((m) => m.status === "defaulter").length,
    lapsed:       members.filter((m) => m.status === "expired" || m.status === "cancelled").length,
    newThisMonth: members.filter((m) => m.join_date >= thisMonthStart).length,
    newLastMonth: members.filter((m) => m.join_date >= lastMonthStart && m.join_date <= lastMonthEnd).length,
    avgMonthlyFee: activeM.length > 0
      ? Math.round(activeM.reduce(
          (s, m) => s + Math.max(0, Number(m.monthly_fee) - Number((m as { monthly_discount?: number }).monthly_discount ?? 0)),
          0,
        ) / activeM.length)
      : 0,
    expiringIn7Days: members
      .filter((m) => m.status === "active" && m.plan_expiry_date && m.plan_expiry_date >= today && m.plan_expiry_date <= in7Days)
      .map(toExpiryRow)
      .sort((a, b) => a.daysLeft - b.daysLeft),
    expiringIn8To15Days: members
      .filter((m) => m.status === "active" && m.plan_expiry_date && m.plan_expiry_date > in7Days && m.plan_expiry_date <= in15Days)
      .map(toExpiryRow)
      .sort((a, b) => a.daysLeft - b.daysLeft),
    expiringIn16To30Days: members
      .filter((m) => m.status === "active" && m.plan_expiry_date && m.plan_expiry_date > in15Days && m.plan_expiry_date <= in30Days)
      .map(toExpiryRow)
      .sort((a, b) => a.daysLeft - b.daysLeft),
    defaulterList,
    planDistribution,
  };

  return { revenueByMonth, aging, trainerRows, trainerFlow, memberSummary };
}

export async function getReportsData() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return null;
  const data = await unstable_cache(
    () => _fetchReports(gymId),
    ["reports", gymId],
    { revalidate: 60, tags: [`reports-${gymId}`] }
  )();
  return { gymId, ...data };
}

// ── Leads / Pipeline ───────────────────────────────────────────────────────

export async function getLeadsData() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, leads: [], plans: [], staff: [], activities: [] };

  const admin = createAdminClient();
  const [leadsRes, plansRes, staffRes, activitiesRes] = await Promise.all([
    admin.from("pulse_leads")
      .select("*, plan:pulse_membership_plans(name), assignee:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false }),
    admin.from("pulse_membership_plans").select("id,name,price").eq("gym_id", gymId).eq("is_active", true),
    admin.from("pulse_staff").select("id,full_name,role").eq("gym_id", gymId).eq("status", "active"),
    admin.from("pulse_lead_activities")
      .select("lead_id, type, content, created_at")
      .order("created_at", { ascending: false }),
  ]);

  type RawActivity = { lead_id: string; type: string; content: string | null; created_at: string };
  const activities = (activitiesRes.data ?? []) as RawActivity[];

  const lastActivityByLead = new Map<string, string>();
  const countByLead = new Map<string, number>();
  for (const a of activities) {
    if (!lastActivityByLead.has(a.lead_id)) lastActivityByLead.set(a.lead_id, a.created_at);
    countByLead.set(a.lead_id, (countByLead.get(a.lead_id) ?? 0) + 1);
  }

  const leads = ((leadsRes.data ?? []) as unknown as Lead[]).map((l) => ({
    ...l,
    last_activity_at: lastActivityByLead.get(l.id) ?? null,
    activities_count: countByLead.get(l.id) ?? 0,
  }));

  return {
    gymId,
    leads,
    plans: (plansRes.data ?? []) as Pick<MembershipPlan, "id" | "name" | "price">[],
    staff: (staffRes.data ?? []) as Pick<Staff, "id" | "full_name" | "role">[],
    activities: activities.map((a) => ({ lead_id: a.lead_id, type: a.type, content: a.content, created_at: a.created_at })),
  };
}

export async function getLeadActivities(leadId: string) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return [];
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("pulse_leads")
    .select("id, gym_id")
    .eq("id", leadId)
    .single();
  if (!lead || lead.gym_id !== ctx.gymId) return [];
  const { data } = await admin
    .from("pulse_lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return (data ?? []) as LeadActivity[];
}

// Lightweight summary used by the dashboard widget — counts only.
export async function getLeadsSummary() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return null;
  const admin = createAdminClient();
  const today = formatDateInput(new Date());

  const { data: leads } = await admin
    .from("pulse_leads")
    .select("id, full_name, source, status, next_followup_at, created_at")
    .eq("gym_id", gymId);

  const all = (leads ?? []) as { id: string; full_name: string; source: string; status: string; next_followup_at: string | null; created_at: string }[];
  const open = all.filter((l) => l.status !== "won" && l.status !== "lost");
  const overdue = open.filter((l) => l.next_followup_at && l.next_followup_at < today);
  const dueToday = open.filter((l) => l.next_followup_at === today);
  const upcoming = dueToday.slice(0, 3).map((l) => ({ id: l.id, name: l.full_name, source: l.source }));

  const won = all.filter((l) => l.status === "won").length;
  const total = all.length;

  return {
    open: open.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    upcoming,
    conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
  };
}

// ── Compliance / printable report data ─────────────────────────────────────

export async function getComplianceReportData() {
  const owner = await getAuthContext();
  let gymId: string | null = owner?.gymId ?? null;
  let gym: Gym | null = owner?.gym ?? null;
  if (!gymId) {
    const staff = await getStaffSession();
    if (staff?.gymId) {
      gymId = staff.gymId;
      const { data } = await createAdminClient()
        .from("pulse_gyms").select("*").eq("id", gymId).single();
      gym = (data ?? null) as Gym | null;
    }
  }
  if (!gymId) return null;
  const admin = createAdminClient();

  const [{ data: members }, { data: payments }, { data: trainers }] = await Promise.all([
    admin.from("pulse_members")
      .select("id, full_name, member_number, phone, email, cnic, monthly_fee, monthly_discount, plan_id, assigned_trainer_id, status, join_date, plan_expiry_date, plan:pulse_membership_plans(name), trainer:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .order("full_name"),
    admin.from("pulse_payments")
      .select("member_id, total_amount, status, payment_date, for_period")
      .eq("gym_id", gymId)
      .eq("status", "paid"),
    admin.from("pulse_staff")
      .select("id, full_name")
      .eq("gym_id", gymId)
      .eq("role", "trainer"),
  ]);

  // Compliance / FBR export = realized revenue. Replace monthly_fee with net
  // of recurring discount so the report and CSV/PDF exports show what the gym
  // actually collects from each member.
  type RawComplianceRow = {
    id: string; full_name: string; member_number: string | null; phone: string | null;
    email: string | null; cnic: string | null; monthly_fee: number; monthly_discount: number | null;
    plan_id: string | null;
    assigned_trainer_id: string | null; status: string; join_date: string;
    plan_expiry_date: string | null;
    plan?: { name: string } | null;
    trainer?: { full_name: string } | null;
  };
  const adjustedMembers = ((members ?? []) as unknown as RawComplianceRow[]).map((m) => ({
    ...m,
    monthly_fee: Math.max(0, Number(m.monthly_fee) - Number(m.monthly_discount ?? 0)),
  }));

  return {
    gym,
    members: adjustedMembers,
    payments: (payments ?? []) as Array<{ member_id: string; total_amount: number; status: string; payment_date: string | null; for_period: string | null }>,
    trainers: (trainers ?? []) as Array<{ id: string; full_name: string }>,
  };
}

// ── Compliance ────────────────────────────────────────────────────────────────

export interface ComplianceMember {
  id: string;
  full_name: string;
  cnic: string | null;
  phone: string | null;
  date_of_birth: string | null;
  join_date: string;
  plan_name: string | null;
  monthly_fee: number;
  category: "self" | "pt";
}

export const getComplianceContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("pulse_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "compliance") return null;

  const { data: complianceUser } = await supabase
    .from("pulse_compliance_users")
    .select("id, gym_id, full_name, gym:pulse_gyms(name)")
    .eq("user_id", user.id)
    .single();

  if (!complianceUser) return null;

  const cu = complianceUser as unknown as { id: string; gym_id: string; full_name: string; gym: { name: string } | null };
  return {
    user,
    complianceUser: { id: cu.id, gym_id: cu.gym_id, full_name: cu.full_name },
    gymName: cu.gym?.name ?? "",
  };
});

export async function getCompliancePageData() {
  const ctx = await getComplianceContext();
  if (!ctx) return null;

  const { complianceUser } = ctx;
  const admin = createAdminClient();

  const [{ data: gymData }, { data: membersData }] = await Promise.all([
    admin
      .from("pulse_gyms")
      .select("name, compliance_settings")
      .eq("id", complianceUser.gym_id)
      .single(),
    admin
      .from("pulse_members")
      .select("id, full_name, cnic, phone, date_of_birth, join_date, monthly_fee, monthly_discount, assigned_trainer_id, plan:pulse_membership_plans(name)")
      .eq("gym_id", complianceUser.gym_id)
      .eq("status", "active")
      .order("id", { ascending: true }),
  ]);

  const settings = gymData?.compliance_settings as { pct_self?: number; pct_pt?: number } | null;
  const pctSelf = Math.min(100, Math.max(0, settings?.pct_self ?? 50));
  const pctPt = Math.min(100, Math.max(0, settings?.pct_pt ?? 50));

  type RawMember = {
    id: string;
    full_name: string;
    cnic: string | null;
    phone: string | null;
    date_of_birth: string | null;
    join_date: string;
    monthly_fee: number;
    monthly_discount: number | null;
    assigned_trainer_id: string | null;
    plan?: { name: string } | null;
  };

  const allMembers = (membersData ?? []) as unknown as RawMember[];

  const allSelf = allMembers.filter((m) => m.assigned_trainer_id === null);
  const allPt = allMembers.filter((m) => m.assigned_trainer_id !== null);

  const selfRaw = allSelf.slice(0, Math.floor(allSelf.length * pctSelf / 100));
  const ptRaw = allPt.slice(0, Math.floor(allPt.length * pctPt / 100));

  const toComplianceMember = (m: RawMember, category: "self" | "pt"): ComplianceMember => ({
    id: m.id,
    full_name: m.full_name,
    cnic: m.cnic,
    phone: m.phone,
    date_of_birth: m.date_of_birth,
    join_date: m.join_date,
    plan_name: m.plan?.name ?? null,
    // Compliance/FBR export = realized revenue (net of recurring discount).
    monthly_fee: Math.max(0, Number(m.monthly_fee) - Number(m.monthly_discount ?? 0)),
    category,
  });

  const members: ComplianceMember[] = [
    ...selfRaw.map((m) => toComplianceMember(m, "self")),
    ...ptRaw.map((m) => toComplianceMember(m, "pt")),
  ];

  const shownRevenue = [...selfRaw, ...ptRaw].reduce(
    (s, m) => s + Math.max(0, Number(m.monthly_fee ?? 0) - Number(m.monthly_discount ?? 0)),
    0,
  );

  return {
    gymName: gymData?.name ?? "",
    members,
    pctSelf,
    pctPt,
    totalSelf: allSelf.length,
    totalPt: allPt.length,
    shownRevenue,
  };
}

export async function getComplianceSettingsForGym(gymId: string) {
  const admin = createAdminClient();

  const [{ data: complianceUser }, { data: gymData }, { data: membersData }] = await Promise.all([
    admin
      .from("pulse_compliance_users")
      .select("full_name, user_id")
      .eq("gym_id", gymId)
      .maybeSingle(),
    admin
      .from("pulse_gyms")
      .select("compliance_settings")
      .eq("id", gymId)
      .single(),
    admin
      .from("pulse_members")
      .select("assigned_trainer_id, monthly_fee")
      .eq("gym_id", gymId)
      .eq("status", "active"),
  ]);

  const settings = gymData?.compliance_settings as { pct_self?: number; pct_pt?: number } | null;
  const members = (membersData ?? []) as { assigned_trainer_id: string | null; monthly_fee: number }[];
  const totalSelf = members.filter((m) => m.assigned_trainer_id === null).length;
  const totalPt = members.filter((m) => m.assigned_trainer_id !== null).length;

  const cu = complianceUser as unknown as { full_name: string; user_id: string } | null;

  let complianceEmail: string | null = null;
  if (cu?.user_id) {
    const { data: profile } = await admin
      .from("pulse_profiles")
      .select("email")
      .eq("id", cu.user_id)
      .maybeSingle();
    complianceEmail = (profile as { email: string } | null)?.email ?? null;
  }

  return {
    hasLogin: cu !== null,
    complianceUser: cu ? { full_name: cu.full_name, email: complianceEmail, userId: cu.user_id } : null,
    pctSelf: settings?.pct_self ?? 50,
    pctPt: settings?.pct_pt ?? 50,
    totalSelf,
    totalPt,
  };
}

// ── Smart Earn ────────────────────────────────────────────────────────────────

async function _fetchSmartEarn(gymId: string) {
  const admin = createAdminClient();
  const [trainersRes, membersRes, plansRes, gymRes] = await Promise.all([
    admin.from("pulse_staff")
      .select("id,full_name,commission_percentage,commission_floor,member_capacity")
      .eq("gym_id", gymId)
      .eq("role", "trainer")
      .eq("status", "active")
      .order("full_name"),
    admin.from("pulse_members")
      .select("id,full_name,member_number,assigned_trainer_id,plan_id,monthly_fee,join_date,plan_expiry_date,status,updated_at")
      .eq("gym_id", gymId),
    admin.from("pulse_membership_plans")
      .select("id,name,price")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("price"),
    admin.from("pulse_gyms")
      .select("default_trainer_capacity")
      .eq("id", gymId)
      .single(),
  ]);
  return {
    trainers: (trainersRes.data ?? []) as { id: string; full_name: string; commission_percentage: number | null; commission_floor: number | null; member_capacity: number }[],
    members:  (membersRes.data  ?? []) as { id: string; full_name: string; member_number: string | null; assigned_trainer_id: string | null; plan_id: string | null; monthly_fee: number; join_date: string; plan_expiry_date: string | null; status: string; updated_at: string }[],
    plans:    (plansRes.data    ?? []) as { id: string; name: string; price: number }[],
    defaultTrainerCapacity: (gymRes.data?.default_trainer_capacity ?? 20) as number,
  };
}

export async function getSmartEarnData() {
  const gymId = await resolveActiveGymId();
  if (!gymId) return { gymId: null, trainers: [], members: [], plans: [], defaultTrainerCapacity: 20 };
  const data = await unstable_cache(
    () => _fetchSmartEarn(gymId),
    ["smart-earn", gymId],
    { revalidate: 60, tags: [`smart-earn-${gymId}`] }
  )();
  return { gymId, ...data };
}

// ── Inventory ────────────────────────────────────────────────────────────────

async function _fetchInventory(gymId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const today = formatDateInput(now);
  const in60Days = formatDateInput(new Date(now.getTime() + 60 * 86400000));
  const startOfMonth = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const startOfLastMonth = formatDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const endOfLastMonth = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 0));
  const startOfYear = formatDateInput(new Date(now.getFullYear(), 0, 1));

  const [itemsRes, batchesRes, salesRes, expiringRes, members30Res] = await Promise.all([
    admin.from("pulse_inventory_items")
      .select("*")
      .eq("gym_id", gymId)
      .eq("archived", false)
      .order("name"),
    admin.from("pulse_inventory_batches")
      .select("*")
      .eq("gym_id", gymId)
      .gt("quantity_remaining", 0)
      .order("purchase_date", { ascending: true })
      .limit(2000),
    admin.from("pulse_inventory_sales")
      .select("*, item:pulse_inventory_items(name, category), member:pulse_members(full_name), staff:pulse_staff(full_name)")
      .eq("gym_id", gymId)
      .gte("sold_at", startOfYear)
      .order("sold_at", { ascending: false })
      .limit(500),
    admin.from("pulse_inventory_batches")
      .select("id, item_id, quantity_remaining, expiry_date, item:pulse_inventory_items!inner(name, category)")
      .eq("gym_id", gymId)
      .gt("quantity_remaining", 0)
      .not("expiry_date", "is", null)
      .lte("expiry_date", in60Days)
      .order("expiry_date", { ascending: true })
      .limit(200),
    admin.from("pulse_members")
      .select("id, full_name, status")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("full_name")
      .limit(500),
  ]);

  const items = (itemsRes.data ?? []) as InventoryItem[];
  const batches = (batchesRes.data ?? []) as InventoryBatch[];
  const sales = (salesRes.data ?? []) as InventorySale[];
  // Supabase typing for joined "!inner" relations comes back as array; we know it's 1:1 here.
  const expiringBatchesRaw = (expiringRes.data ?? []) as unknown as Array<{
    id: string;
    item_id: string;
    quantity_remaining: number;
    expiry_date: string;
    item: { name: string; category: import("@/types").InventoryCategory } | { name: string; category: import("@/types").InventoryCategory }[] | null;
  }>;

  // Compute total_stock + earliest_expiry per item from batches
  const stockByItem = new Map<string, number>();
  const earliestExpiryByItem = new Map<string, string>();
  for (const b of batches) {
    stockByItem.set(b.item_id, (stockByItem.get(b.item_id) ?? 0) + b.quantity_remaining);
    if (b.expiry_date) {
      const cur = earliestExpiryByItem.get(b.item_id);
      if (!cur || b.expiry_date < cur) earliestExpiryByItem.set(b.item_id, b.expiry_date);
    }
  }
  const itemsWithStock = items.map((it) => ({
    ...it,
    total_stock: stockByItem.get(it.id) ?? 0,
    earliest_expiry: earliestExpiryByItem.get(it.id) ?? null,
  }));

  // Low-stock items
  const lowStockItems = itemsWithStock.filter((it) => (it.total_stock ?? 0) <= it.low_stock_threshold);

  // Expiring batches with days until expiry
  const expiringBatches: InventoryExpiringBatch[] = expiringBatchesRaw.map((b) => {
    const itemRel = Array.isArray(b.item) ? b.item[0] : b.item;
    const days = Math.round((new Date(b.expiry_date).getTime() - now.getTime()) / 86400000);
    return {
      batch_id: b.id,
      item_id: b.item_id,
      item_name: itemRel?.name ?? "Unknown",
      category: itemRel?.category ?? "other",
      quantity_remaining: b.quantity_remaining,
      expiry_date: b.expiry_date,
      days_until_expiry: days,
    };
  });

  // Profit summary (this month / last month / YTD)
  const summarize = (filtered: InventorySale[]) => {
    const revenue = filtered.reduce((s, x) => s + Number(x.total_amount), 0);
    const cost = filtered.reduce((s, x) => s + Number(x.total_cost), 0);
    return { revenue, cost, profit: revenue - cost, sales_count: filtered.length };
  };
  const profitSummary: InventoryProfitSummary = {
    thisMonth: summarize(sales.filter((s) => s.sold_at.slice(0, 10) >= startOfMonth)),
    lastMonth: summarize(sales.filter((s) => s.sold_at.slice(0, 10) >= startOfLastMonth && s.sold_at.slice(0, 10) <= endOfLastMonth)),
    ytd: summarize(sales),
  };

  // Top sellers (last 30 days)
  const last30 = formatDateInput(new Date(now.getTime() - 30 * 86400000));
  const recent = sales.filter((s) => s.sold_at.slice(0, 10) >= last30);
  const sellerMap = new Map<string, InventoryTopSeller>();
  for (const s of recent) {
    const cur = sellerMap.get(s.item_id) ?? {
      item_id: s.item_id,
      name: s.item?.name ?? "Unknown",
      category: s.item?.category ?? "other",
      units_sold: 0,
      total_revenue: 0,
      total_profit: 0,
    };
    cur.units_sold += s.quantity;
    cur.total_revenue += Number(s.total_amount);
    cur.total_profit += Number(s.profit);
    sellerMap.set(s.item_id, cur);
  }
  const topSellers = Array.from(sellerMap.values()).sort((a, b) => b.total_profit - a.total_profit).slice(0, 10);

  // Dead stock — items with stock > 0 + no sale in 60 days
  const lastSaleByItem = new Map<string, string>();
  for (const s of sales) {
    const cur = lastSaleByItem.get(s.item_id);
    if (!cur || s.sold_at > cur) lastSaleByItem.set(s.item_id, s.sold_at);
  }
  const last60 = formatDateInput(new Date(now.getTime() - 60 * 86400000));
  const stockCostByItem = new Map<string, number>();
  for (const b of batches) {
    stockCostByItem.set(b.item_id, (stockCostByItem.get(b.item_id) ?? 0) + b.quantity_remaining * Number(b.purchase_cost_per_unit));
  }
  const deadStock: InventoryDeadStockItem[] = itemsWithStock
    .filter((it) => (it.total_stock ?? 0) > 0)
    .map((it) => {
      const lastSold = lastSaleByItem.get(it.id) ?? null;
      const days = lastSold ? Math.round((now.getTime() - new Date(lastSold).getTime()) / 86400000) : null;
      return {
        item_id: it.id,
        name: it.name,
        category: it.category,
        total_stock: it.total_stock ?? 0,
        stock_value: stockCostByItem.get(it.id) ?? 0,
        last_sold_at: lastSold,
        days_since_sale: days,
      };
    })
    .filter((d) => !d.last_sold_at || (d.last_sold_at && d.last_sold_at.slice(0, 10) < last60))
    .sort((a, b) => b.stock_value - a.stock_value);

  void today;

  return {
    items: itemsWithStock,
    batches,
    sales,
    members: (members30Res.data ?? []) as { id: string; full_name: string; status: string }[],
    lowStockItems,
    expiringBatches,
    deadStock,
    topSellers,
    profitSummary,
  };
}

export async function getInventoryData() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) {
    return {
      gymId: null,
      isOwner: false,
      items: [], batches: [], sales: [], members: [],
      lowStockItems: [], expiringBatches: [], deadStock: [], topSellers: [],
      profitSummary: {
        thisMonth: { revenue: 0, cost: 0, profit: 0, sales_count: 0 },
        lastMonth: { revenue: 0, cost: 0, profit: 0, sales_count: 0 },
        ytd: { revenue: 0, cost: 0, profit: 0, sales_count: 0 },
      },
    };
  }

  // Determine if current user is the gym owner (vs staff with access)
  const admin = createAdminClient();
  const { data: gymRow } = await admin
    .from("pulse_gyms")
    .select("owner_id")
    .eq("id", ctx.gymId)
    .single();
  const isOwner = gymRow?.owner_id === ctx.user.id;

  const data = await unstable_cache(
    () => _fetchInventory(ctx.gymId as string),
    ["inventory", ctx.gymId],
    { revalidate: 60, tags: [`inventory-${ctx.gymId}`] }
  )();

  return { gymId: ctx.gymId, isOwner, ...data };
}

