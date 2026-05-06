export interface TrainerStat {
  id: string;
  name: string;
  total: number;
  paid: number;
  unpaid: number;
  collected: number;
  totalDue: number;
  rate: number;
}

// ── Enums ──────────────────────────────────────────────────────────────────
export type MemberStatus = "active" | "frozen" | "on_hold" | "defaulter" | "expired" | "cancelled";
export type MemberGender = "male" | "female" | "other";
export type PlanDurationType = "daily" | "monthly" | "quarterly" | "biannual" | "annual" | "dropin";
export type PaymentStatus = "paid" | "pending" | "overdue" | "refunded" | "waived";
export type PaymentMethod = "cash" | "jazzcash" | "easypaisa" | "bank_transfer" | "card" | "other";
export type BillStatus = "paid" | "unpaid" | "overdue";
export type BillCategory = "electricity" | "water" | "internet" | "gas" | "maintenance" | "rent" | "equipment" | "other";
export type BillCondition = "new" | "used";
export type ExpenseCategory = "equipment" | "maintenance" | "cleaning" | "marketing" | "supplements" | "utilities" | "rent" | "security" | "other";
export type StaffRole = "trainer" | "manager" | "frontdesk" | "cleaner" | "guard" | "cook" | "other";
export type ReferrerCommissionType = "flat" | "percentage";
export type ReferralStatus = "pending" | "paid";
export type SocialCommissionType = "flat" | "percentage";
export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "whatsapp" | "other";
export type SocialLeadStatus = "unmatched" | "pending_review" | "pending_payment" | "rejected" | "paid" | "expired";
export type StaffStatus = "active" | "inactive";
export type SalaryStatus = "pending" | "paid";
export type IssueCategory = "equipment" | "cleanliness" | "staff" | "facility" | "billing" | "other";
export type IssuePriority = "low" | "medium" | "high";
export type IssueStatus = "open" | "in_progress" | "resolved";
export type ClassScheduleType = "one_time" | "recurring";
export type ClassBookingStatus = "booked" | "attended" | "cancelled" | "no_show";
export type PTSessionStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type CheckInMethod = "manual" | "qr" | "app" | "device";
export type GymType = "general" | "ladies_only" | "mens_only" | "crossfit" | "martial_arts" | "yoga" | "mixed";
export type ProspectStatus = "pending" | "visited" | "onboarded" | "rejected";

// ── Core Entities ──────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  branch_limit: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  branch_limit: number;
  created_at: string;
  last_sign_in_at: string | null;
  gyms: { id: string; name: string; total_capacity: number }[];
}

export interface PaymentMethodAccount {
  id: string;            // client-side uuid for stable list keys
  label: string;         // e.g. "HBL Bank", "JazzCash", "EasyPaisa"
  account_title?: string;
  account_number?: string;
  iban?: string;
}

export interface Gym {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  city: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  total_capacity: number;
  gym_type: GymType | null;
  gym_types: GymType[];
  amenities: string[];
  operating_hours: Record<string, { open: string; close: string }> | null;
  maps_url: string | null;
  logo_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  listing_enabled: boolean;
  show_member_count: boolean;
  monthly_revenue_target: number;
  ntn: string | null;
  report_settings: {
    fields?: string[];
    notes?: string;
    headerTitle?: string;
    taxRate?: number;          // e.g. 13, 16, 17 — provincial sales tax %
    taxInclusive?: boolean;    // true = gross price already includes tax; false = added on top
    taxLabel?: string;         // e.g. "Sales Tax", "GST", "PST"
  } | null;
  reminder_template: string | null;
  payment_methods: PaymentMethodAccount[];
  device_serial: string | null;
  device_last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicGym {
  id: string;
  owner_id: string;
  owner_name: string | null;
  name: string;
  address: string | null;
  city: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  gym_type: GymType | null;
  gym_types: GymType[];
  amenities: string[];
  maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  show_member_count: boolean;
  total_capacity: number;
  active_members: number;
}

export interface MembershipPlan {
  id: string;
  gym_id: string;
  name: string;
  duration_type: PlanDurationType;
  duration_days: number | null;
  price: number;
  admission_fee: number;
  includes_pt: boolean;
  unlimited_classes: boolean;
  access_hours: string | null;
  description: string | null;
  is_active: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Referrer {
  id: string;
  gym_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  commission_type: ReferrerCommissionType;
  commission_value: number;
  user_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface SocialManager {
  id: string;
  gym_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  commission_type: SocialCommissionType;
  commission_value: number;
  user_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface SocialLead {
  id: string;
  gym_id: string;
  manager_id: string;
  lead_name: string;
  lead_phone: string | null;
  lead_social_handle: string | null;
  platform: SocialPlatform;
  evidence_url: string | null;
  notes: string | null;
  member_id: string | null;
  matched_by: "auto" | "manual" | null;
  matched_at: string | null;
  commission_amount: number | null;
  status: SocialLeadStatus;
  rejection_reason: string | null;
  approved_at: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  manager?: Pick<SocialManager, "full_name"> | null;
  member?: Pick<Member, "full_name" | "phone" | "join_date"> | null;
}

export type CommissionType = "percentage" | "flat";

export interface TrainerShift {
  id: string;
  staff_id: string;
  gym_id: string;
  name: string;
  start_time: string;
  end_time: string;
  commission_type: CommissionType;
  commission_value: number;
  created_at: string;
  updated_at: string;
}

export interface Referral {
  id: string;
  gym_id: string;
  referrer_id: string;
  member_id: string;
  commission_amount: number;
  status: ReferralStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  referrer?: Pick<Referrer, "full_name"> | null;
  member?: Pick<Member, "full_name" | "phone" | "join_date"> | null;
}

export interface Member {
  id: string;
  gym_id: string;
  plan_id: string | null;
  assigned_trainer_id: string | null;
  assigned_shift_id: string | null;
  referrer_id: string | null;
  member_number: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  photo_url: string | null;
  gender: MemberGender | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  medical_notes: string | null;
  device_user_id: string | null;
  join_date: string;
  plan_start_date: string | null;
  plan_expiry_date: string | null;
  status: MemberStatus;
  freeze_start_date: string | null;
  freeze_end_date: string | null;
  hold_since: string | null;
  defaulter_since: string | null;
  admission_fee: number;
  monthly_fee: number;
  outstanding_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan?: Pick<MembershipPlan, "name" | "duration_type" | "price" | "color"> | null;
  trainer?: Pick<Staff, "full_name"> | null;
}

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string | null;
  plan_id: string | null;
  amount: number;
  discount: number;
  late_fee: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_date: string | null;
  for_period: string | null;
  status: PaymentStatus;
  receipt_number: string | null;
  notes: string | null;
  // Trainer who owned the member when this payment was logged. Snapshotted by
  // a DB trigger on insert; immune to future trainer transfers. Used to lock
  // commission credit to the trainer who serviced the member that month.
  trainer_id: string | null;
  created_at: string;
  updated_at: string;
  member?: { full_name: string; plan_id: string | null } | null;
}

export interface CheckIn {
  id: string;
  gym_id: string;
  member_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  check_in_method: CheckInMethod;
  notes: string | null;
  created_at: string;
  member?: Pick<Member, "full_name" | "photo_url" | "member_number" | "status"> | null;
}

export interface Staff {
  id: string;
  gym_id: string;
  full_name: string;
  role: StaffRole;
  specialization: string | null;
  phone: string | null;
  cnic: string | null;
  email: string | null;
  photo_url: string | null;
  join_date: string;
  monthly_salary: number;
  pt_rate: number;
  commission_percentage: number;
  commission_floor: number;
  status: StaffStatus;
  notes: string | null;
  user_id: string | null;
  can_add_members: boolean;
  member_capacity: number;
  created_at: string;
  updated_at: string;
}

export interface SalaryPayment {
  id: string;
  gym_id: string;
  staff_id: string;
  for_month: string;
  base_salary: number;
  commission_amount: number;
  pt_earnings: number;
  total_amount: number;
  status: SalaryStatus;
  payment_method: string | null;
  payment_date: string | null;
  notes: string | null;
  receipt_number: string | null;
  created_at: string;
  staff?: { full_name: string; role: string } | null;
}

export interface PTSession {
  id: string;
  gym_id: string;
  trainer_id: string;
  member_id: string;
  session_date: string;
  duration_minutes: number;
  session_rate: number;
  status: PTSessionStatus;
  notes: string | null;
  created_at: string;
  trainer?: Pick<Staff, "full_name"> | null;
  member?: Pick<Member, "full_name"> | null;
}

export interface GymClass {
  id: string;
  gym_id: string;
  trainer_id: string | null;
  name: string;
  description: string | null;
  category: string;
  capacity: number;
  duration_minutes: number;
  price: number;
  schedule_type: ClassScheduleType;
  recurring_days: string[];
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  color: string;
  created_at: string;
  updated_at: string;
  trainer?: Pick<Staff, "full_name"> | null;
}

export interface ClassBooking {
  id: string;
  gym_id: string;
  class_id: string;
  member_id: string;
  booking_date: string;
  status: ClassBookingStatus;
  created_at: string;
  member?: Pick<Member, "full_name"> | null;
  gym_class?: Pick<GymClass, "name"> | null;
}

export interface BodyMetrics {
  id: string;
  gym_id: string;
  member_id: string;
  measurement_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_percentage: number | null;
  muscle_mass_kg: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  bicep_cm: number | null;
  bmi: number | null;
  notes: string | null;
  measured_by: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  gym_id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  notes: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  gym_id: string;
  title: string;
  category: BillCategory;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: BillStatus;
  notes: string | null;
  condition: BillCondition | null;
  reminder_days: number;
  late_fee: number;
  created_at: string;
}

export interface Issue {
  id: string;
  gym_id: string;
  member_id: string | null;
  title: string;
  description: string | null;
  category: IssueCategory;
  priority: IssuePriority;
  status: IssueStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  member?: { full_name: string } | null;
}

export interface Announcement {
  id: string;
  gym_id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prospect {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  status: ProspectStatus;
  notes: string | null;
  wave: number | null;
  priority_score: number;
  priority_reason: string | null;
  is_avoid: boolean;
  avoid_reason: string | null;
  estimated_members: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface LoginLog {
  id: string;
  user_id: string | null;
  email: string;
  logged_in_at: string;
  created_at: string;
}

// ── Dashboard / Analytics ──────────────────────────────────────────────────
export interface DashboardStats {
  total_members: number;
  active_members: number;
  expired_members: number;
  frozen_members: number;
  todays_checkins: number;
  monthly_revenue: number;
  monthly_collected: number;
  monthly_outstanding: number;
  monthly_expenses: number;
  monthly_salaries: number;
  monthly_paid_bills: number;
  net_profit: number;
  unpaid_bills: number;
  unpaid_bills_amount: number;
  expiring_this_week: number;
  revenue_target: number;
  pending_commissions_amount: number;
  pending_commissions_count: number;
  paid_commissions_this_month: number;
  pending_social_commissions_amount: number;
  pending_social_commissions_count: number;
  paid_social_commissions_this_month: number;
}

export interface DashboardMember {
  id: string;
  name: string;
  amount: number;
  status: string;
  days_overdue?: number;
}

export interface RevenueMonth {
  month: string;
  monthKey: string;
  collected: number;
  due: number;
  expenses: number;
  salaries: number;
  profit: number;
  collectionRate: number;
  newMembers: number;
  cancelledMembers: number;
  activeMembers: number;
}

export interface AgingBucket {
  count: number;
  amount: number;
}

export interface TrainerReportRow {
  id: string;
  name: string;
  activeMembers: number;
  monthlyFeeGenerated: number;
  baseSalary: number;
  commissionEarned: number;
  totalCost: number;
  netContribution: number;
  salaryGenerated: boolean;
}

export interface TrainerFlowMonth {
  month: string;
  monthKey: string;
  gained: number;
  lost: number;
  net: number;
}

export interface TrainerFlowRow {
  id: string;
  name: string;
  months: TrainerFlowMonth[];
  avgGained: number;
  avgLost: number;
  avgNet: number;
}

export interface ExpiringMember {
  id: string;
  name: string;
  phone: string | null;
  planExpiry: string;
  daysLeft: number;
}

export interface DefaulterRow {
  id: string;
  name: string;
  phone: string | null;
  defaulterSince: string | null;
  monthlyFee: number;
}

export interface PlanDistributionRow {
  planId: string | null;
  planName: string;
  memberCount: number;
  percentage: number;
  monthlyRevenue: number;
}

export interface MemberReportSummary {
  total: number;
  active: number;
  frozen: number;
  defaulters: number;
  lapsed: number;
  newThisMonth: number;
  newLastMonth: number;
  avgMonthlyFee: number;
  expiringIn7Days: ExpiringMember[];
  expiringIn8To15Days: ExpiringMember[];
  expiringIn16To30Days: ExpiringMember[];
  defaulterList: DefaulterRow[];
  planDistribution: PlanDistributionRow[];
}

export interface GoalWin {
  id: string;
  memberName: string;
  trainerId: string | null;
  trainerName: string;
  title: string;
  category: string;
  unit: string;
  startValue: number | null;
  finalValue: number;
  targetValue: number;
  direction: "down" | "up";
  startDate: string;
  achievedAt: string;
}

export interface TrainerGoalRow {
  id: string;
  name: string;
  activeCount: number;
  achievedCount: number;
  recentAchieved: number;
  winRate: number;
}

export interface GoalsOverview {
  activeCount: number;
  achievedThisMonth: number;
  totalAchieved: number;
  behindCount: number;
  recentWins: GoalWin[];
  byTrainer: TrainerGoalRow[];
}

export type GoalCategory =
  | "weight_loss" | "muscle_gain" | "strength" | "endurance" | "flexibility"
  | "yoga" | "pilates" | "postnatal" | "toning"
  | "custom";
export type GoalStatus = "active" | "achieved" | "paused" | "abandoned";
export type GoalDirection = "down" | "up";

export interface MemberGoal {
  id: string;
  gym_id: string;
  member_id: string;
  trainer_id: string | null;
  title: string;
  category: GoalCategory;
  unit: string;
  start_value: number | null;
  target_value: number;
  current_value: number | null;
  direction: GoalDirection;
  start_date: string;
  target_date: string;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  progress?: GoalProgressEntry[];
}

export interface GoalProgressEntry {
  id: string;
  goal_id: string;
  value: number;
  recorded_at: string;
  notes: string | null;
  created_at: string;
}

export interface BodyMetric {
  id: string;
  gym_id: string;
  member_id: string;
  measurement_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_percentage: number | null;
  muscle_mass_kg: number | null;
  bmi: number | null;
  shoulders_cm: number | null;
  neck_cm: number | null;
  chest_cm: number | null;
  bicep_l_cm: number | null;
  bicep_r_cm: number | null;
  bicep_cm: number | null;
  forearm_l_cm: number | null;
  forearm_r_cm: number | null;
  waist_cm: number | null;
  abdomen_cm: number | null;
  hips_cm: number | null;
  thigh_l_cm: number | null;
  thigh_r_cm: number | null;
  calf_l_cm: number | null;
  calf_r_cm: number | null;
  resting_heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  visceral_fat: number | null;
  water_percentage: number | null;
  bone_mass_kg: number | null;
  custom_metrics: Record<string, number> | null;
  notes: string | null;
  measured_by: string | null;
  created_at: string;
}

export interface MetricSkip {
  id: string;
  gym_id: string;
  member_id: string;
  week_start: string;
  reason: string | null;
  closed_by: string | null;
  created_at: string;
}

export type LeadSource = "walk_in" | "instagram" | "facebook" | "tiktok" | "referral" | "ad" | "website" | "google" | "other";
export type LeadStatus = "new" | "contacted" | "visited" | "trial" | "negotiating" | "won" | "lost";
export type LeadLostReason = "price" | "location" | "schedule" | "competitor" | "not_ready" | "no_response" | "other";
export type LeadActivityType = "note" | "call" | "message" | "offer" | "visit" | "trial" | "status_change";

export interface Lead {
  id: string;
  gym_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  source_detail: string | null;
  interested_plan_id: string | null;
  fitness_goals: string | null;
  status: LeadStatus;
  next_followup_at: string | null;
  assigned_to: string | null;
  lost_reason: LeadLostReason | null;
  lost_note: string | null;
  converted_member_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan?: { name: string } | null;
  assignee?: { full_name: string } | null;
  last_activity_at?: string | null;
  activities_count?: number;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  content: string | null;
  created_by: string | null;
  created_at: string;
}
