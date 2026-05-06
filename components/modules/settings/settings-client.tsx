"use client";
import { useEffect, useState } from "react";
import { Building2, User, Save, Loader2, Globe, ExternalLink, Target, Shield, Trash2, Eye, EyeOff, Ban, KeyRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useGymContext } from "@/contexts/gym-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { PaymentRecoverySection } from "./payment-recovery-section";
import { createComplianceLogin, removeComplianceLogin, updateComplianceSettings, getComplianceSettingsAction } from "@/app/actions/compliance";
import { changePassword as changePasswordAction, resetStaffPassword } from "@/app/actions/account";
import type { GymType } from "@/types";

const GYM_TYPES: { value: GymType; label: string }[] = [
  { value: "general",      label: "General" },
  { value: "ladies_only",  label: "Ladies Only" },
  { value: "mens_only",    label: "Mens Only" },
  { value: "crossfit",     label: "CrossFit" },
  { value: "martial_arts", label: "Martial Arts" },
  { value: "yoga",         label: "Yoga / Pilates" },
  { value: "mixed",        label: "Mixed" },
];

const ALL_AMENITIES = [
  "WiFi", "AC", "Parking", "CCTV", "Hot Showers", "Locker Rooms",
  "Personal Training", "Group Classes", "Sauna", "Steam Room",
  "Juice Bar", "Supplements Shop", "Kids Area", "Pro Shop",
];

function DeviceStatusBadge({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
        <span className="text-muted-foreground">●</span> Never connected
      </p>
    );
  }

  const diffMs = Date.now() - new Date(lastSeen).getTime();
  const diffMins = diffMs / 60_000;
  const diffHours = diffMs / 3_600_000;
  const diffDays = diffMs / 86_400_000;

  if (diffMins < 10) {
    return (
      <p className="text-xs text-emerald-600 flex items-center gap-1.5 mt-1">
        <span>●</span> Connected
      </p>
    );
  }

  if (diffHours < 24) {
    const h = Math.floor(diffHours);
    return (
      <p className="text-xs text-amber-500 flex items-center gap-1.5 mt-1">
        <span>⚠</span> Last seen {h === 1 ? "1 hour" : `${h} hours`} ago
      </p>
    );
  }

  const d = Math.floor(diffDays);
  return (
    <p className="text-xs text-rose-500 flex items-center gap-1.5 mt-1">
      <span>●</span> Inactive — last seen {d === 1 ? "1 day" : `${d} days`} ago
    </p>
  );
}

export function SettingsClient() {
  const { profile, gym, isDemo } = useGymContext();
  const gymId = gym?.id ?? null;

  const [gymForm, setGymForm] = useState({
    name: "", address: "", city: "", area: "", phone: "", email: "",
    monthly_revenue_target: "",
    default_trainer_capacity: "20",
    device_serial: "",
  });
  const [listingForm, setListingForm] = useState({
    listing_enabled: false,
    maps_url: "",
    logo_url: "",
    description: "",
    gym_type: "" as GymType | "",
    gym_types: [] as GymType[],
    amenities: [] as string[],
    instagram_url: "",
    tiktok_url: "",
    facebook_url: "",
    show_member_count: true,
  });
  const [profileForm, setProfileForm] = useState({ full_name: "" });
  const [savingGym, setSavingGym] = useState(false);
  const [savingListing, setSavingListing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [defaulterThreshold, setDefaulterThreshold] = useState(2);
  const [savingDefaulter, setSavingDefaulter] = useState(false);

  // ── Change password ────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // ── Compliance ─────────────────────────────────────────────────────────────
  const [complianceLoaded, setComplianceLoaded] = useState(false);
  const [hasComplianceLogin, setHasComplianceLogin] = useState(false);
  const [complianceUserName, setComplianceUserName] = useState<string | null>(null);
  const [complianceUserId, setComplianceUserId] = useState<string | null>(null);
  const [resetComplianceOpen, setResetComplianceOpen] = useState(false);
  const [resetCompliancePw, setResetCompliancePw] = useState("");
  const [resetComplianceSaving, setResetComplianceSaving] = useState(false);
  const [resetComplianceDone, setResetComplianceDone] = useState(false);
  const [complianceForm, setComplianceForm] = useState({ full_name: "", email: "", password: "", pct_self: "50", pct_pt: "50" });
  const [complianceTotals, setComplianceTotals] = useState({ totalSelf: 0, totalPt: 0 });
  const [complianceEmail, setComplianceEmail] = useState<string | null>(null);
  const [showCompliancePass, setShowCompliancePass] = useState(false);
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [removingCompliance, setRemovingCompliance] = useState(false);

  useEffect(() => {
    if (!gymId) return;
    getComplianceSettingsAction().then((res) => {
      if (!res) return;
      setHasComplianceLogin(res.hasLogin);
      setComplianceUserName(res.complianceUser?.full_name ?? null);
      setComplianceUserId(res.complianceUser?.userId ?? null);
      setComplianceEmail(res.complianceUser?.email ?? null);
      setComplianceForm((f) => ({ ...f, pct_self: String(res.pctSelf), pct_pt: String(res.pctPt) }));
      setComplianceTotals({ totalSelf: res.totalSelf, totalPt: res.totalPt });
      setComplianceLoaded(true);
    });
  }, [gymId]);

  async function handleResetCompliancePassword() {
    if (isDemo) { toast({ title: "Demo mode", description: "Sign up to make changes." }); return; }
    if (!complianceUserId || !resetCompliancePw) return;
    setResetComplianceSaving(true);
    const res = await resetStaffPassword(complianceUserId, resetCompliancePw);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { setResetComplianceDone(true); toast({ title: "Password reset successfully" }); }
    setResetComplianceSaving(false);
  }

  async function createCompliance() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    if (!complianceForm.full_name || !complianceForm.email || !complianceForm.password) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    setSavingCompliance(true);
    const res = await createComplianceLogin(gymId, complianceForm.full_name, complianceForm.email, complianceForm.password);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      await updateComplianceSettings(gymId, Number(complianceForm.pct_self) || 50, Number(complianceForm.pct_pt) || 50);
      toast({ title: "Compliance login created" });
      setHasComplianceLogin(true);
      setComplianceUserName(complianceForm.full_name);
      setComplianceForm((f) => ({ ...f, full_name: "", email: "", password: "" }));
    }
    setSavingCompliance(false);
  }

  async function removeCompliance() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    setRemovingCompliance(true);
    const res = await removeComplianceLogin(gymId);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Compliance login removed" }); setHasComplianceLogin(false); setComplianceUserName(null); }
    setRemovingCompliance(false);
  }

  async function saveComplianceLimits() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    setSavingCompliance(true);
    const res = await updateComplianceSettings(gymId, Number(complianceForm.pct_self) || 50, Number(complianceForm.pct_pt) || 50);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else toast({ title: "Compliance limits updated" });
    setSavingCompliance(false);
  }

  useEffect(() => {
    if (gym) {
      setGymForm({
        name: gym.name ?? "",
        address: gym.address ?? "",
        city: gym.city ?? "",
        area: gym.area ?? "",
        phone: gym.phone ?? "",
        email: gym.email ?? "",
        monthly_revenue_target: gym.monthly_revenue_target?.toString() ?? "",
        default_trainer_capacity: ((gym as typeof gym & { default_trainer_capacity?: number }).default_trainer_capacity ?? 20).toString(),
        device_serial: gym.device_serial ?? "",
      });
      const cs = (gym as typeof gym & { compliance_settings?: Record<string, unknown> | null }).compliance_settings;
      setDefaulterThreshold(Math.max(1, Math.min(6, (cs?.defaulter_threshold_months as number) ?? 2)));
      setListingForm({
        listing_enabled: gym.listing_enabled ?? false,
        maps_url: gym.maps_url ?? "",
        instagram_url: gym.instagram_url ?? "",
        tiktok_url: gym.tiktok_url ?? "",
        facebook_url: gym.facebook_url ?? "",
        show_member_count: gym.show_member_count ?? true,
        logo_url: gym.logo_url ?? "",
        description: gym.description ?? "",
        gym_type: gym.gym_type ?? "",
        gym_types: (gym.gym_types ?? []) as GymType[],
        amenities: gym.amenities ?? [],
      });
    }
  }, [gym]);

  useEffect(() => {
    if (profile) setProfileForm({ full_name: profile.full_name ?? "" });
  }, [profile]);

  async function saveGym(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    setSavingGym(true);
    const supabase = createClient();
    const { error } = await supabase.from("pulse_gyms").update({
      name: gymForm.name,
      address: gymForm.address || null,
      city: gymForm.city || null,
      area: gymForm.area || null,
      phone: gymForm.phone || null,
      email: gymForm.email || null,
      monthly_revenue_target: parseFloat(gymForm.monthly_revenue_target) || 0,
      default_trainer_capacity: Math.max(1, parseInt(gymForm.default_trainer_capacity) || 20),
      device_serial: gymForm.device_serial.trim() || null,
    }).eq("id", gymId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Gym settings saved" });
    setSavingGym(false);
  }

  async function saveListing(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    setSavingListing(true);
    const supabase = createClient();
    const { error } = await supabase.from("pulse_gyms").update({
      listing_enabled: listingForm.listing_enabled,
      maps_url: listingForm.maps_url || null,
      logo_url: listingForm.logo_url || null,
      description: listingForm.description || null,
      gym_type: listingForm.gym_types[0] || null,
      gym_types: listingForm.gym_types,
      amenities: listingForm.amenities,
      instagram_url: listingForm.instagram_url || null,
      tiktok_url: listingForm.tiktok_url || null,
      facebook_url: listingForm.facebook_url || null,
      show_member_count: listingForm.show_member_count,
    }).eq("id", gymId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({
      title: listingForm.listing_enabled ? "Listing published" : "Listing hidden",
      description: listingForm.listing_enabled
        ? "Your gym is now visible on the public directory."
        : "Your gym has been removed from the public directory.",
    });
    setSavingListing(false);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!profile) return;
    setSavingProfile(true);
    const supabase = createClient();
    const { error } = await supabase.from("pulse_profiles").update({ full_name: profileForm.full_name }).eq("id", profile.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
    setSavingProfile(false);
  }

  async function saveDefaulterThreshold() {
    if (isDemo) { toast({ title: "You're in demo mode", description: "Sign up to unlock editing →" }); return; }
    if (!gymId) return;
    setSavingDefaulter(true);
    const supabase = createClient();
    const { error } = await supabase.from("pulse_gyms")
      .update({ compliance_settings: { ...(gym as typeof gym & { compliance_settings?: Record<string, unknown> | null }).compliance_settings, defaulter_threshold_months: defaulterThreshold } })
      .eq("id", gymId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Defaulter threshold updated" });
    setSavingDefaulter(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.next.length < 8) { toast({ title: "Password too short", description: "Minimum 8 characters.", variant: "destructive" }); return; }
    if (pwForm.next !== pwForm.confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setSavingPw(true);
    const res = await changePasswordAction(pwForm.current, pwForm.next);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Password updated successfully" }); setPwForm({ current: "", next: "", confirm: "" }); }
    setSavingPw(false);
  }

  function toggleAmenity(a: string) {
    setListingForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
    }));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your gym and profile</p>
      </div>

      {/* Gym Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Gym Information</CardTitle>
          </div>
          <CardDescription>Update your gym details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveGym} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Gym Name *</Label>
              <Input
                placeholder="Pulse Fitness"
                value={gymForm.name}
                onChange={(e) => setGymForm({ ...gymForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                placeholder="Street address"
                value={gymForm.address}
                onChange={(e) => setGymForm({ ...gymForm, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  placeholder="Karachi"
                  value={gymForm.city}
                  onChange={(e) => setGymForm({ ...gymForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Area / Neighbourhood</Label>
                <Input
                  placeholder="Gulshan-e-Iqbal"
                  value={gymForm.area}
                  onChange={(e) => setGymForm({ ...gymForm, area: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="+92 300 0000000"
                  value={gymForm.phone}
                  onChange={(e) => setGymForm({ ...gymForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="gym@example.com"
                  value={gymForm.email}
                  onChange={(e) => setGymForm({ ...gymForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[hsl(219_100%_50%)]" />
                Monthly Revenue Target (PKR)
              </Label>
              <Input
                type="number"
                placeholder="0"
                min="0"
                value={gymForm.monthly_revenue_target}
                onChange={(e) => setGymForm({ ...gymForm, monthly_revenue_target: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Used to show progress bar on dashboard. Leave 0 to hide.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Default Trainer Member Capacity</Label>
              <Input
                type="number"
                placeholder="20"
                min="1"
                value={gymForm.default_trainer_capacity}
                onChange={(e) => setGymForm({ ...gymForm, default_trainer_capacity: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Default max members per trainer for Profit Insights. Override per trainer in Trainers settings.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Fingerprint Device Serial (SN)</Label>
              <Input
                placeholder="e.g. JJA1251000463"
                value={gymForm.device_serial}
                onChange={(e) => setGymForm({ ...gymForm, device_serial: e.target.value.toUpperCase() })}
              />
              <p className="text-xs text-muted-foreground">
                Found on the device label or Menu → System Info. Links your ZKTeco device to this gym.
              </p>
              {gym?.device_serial && (
                <DeviceStatusBadge lastSeen={gym.device_last_seen ?? null} />
              )}
            </div>
            <Button type="submit" disabled={savingGym} className="gap-2">
              {savingGym ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Gym
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Public Listing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Public Listing</CardTitle>
          </div>
          <CardDescription>
            List your gym on the public directory so members can discover you.{" "}
            <a href="/find" target="_blank" className="inline-flex items-center gap-0.5 text-[hsl(219_100%_50%)] hover:underline">
              Preview directory <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveListing} className="space-y-5">
            {/* Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-sidebar-border bg-white/[0.02]">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {listingForm.listing_enabled ? "Listed publicly" : "Not listed"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {listingForm.listing_enabled
                    ? "Your gym appears in the public directory."
                    : "Enable to appear in the public gym directory."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setListingForm((f) => ({ ...f, listing_enabled: !f.listing_enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                  listingForm.listing_enabled ? "bg-[hsl(219_100%_50%)]" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    listingForm.listing_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {listingForm.listing_enabled && (
              <>
                {/* Info notice */}
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-[hsl(219_100%_50%/0.05)] border border-[hsl(219_100%_50%/0.15)] text-xs text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 text-[hsl(219_100%_50%)] shrink-0 mt-0.5" />
                  <span>
                    Name, city, area, phone, and email are pulled from{" "}
                    <strong className="text-foreground">Gym Information</strong> above — no need to enter them again.
                  </span>
                </div>

                {/* Logo URL */}
                <div className="space-y-1.5">
                  <Label>Logo URL</Label>
                  <Input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={listingForm.logo_url}
                    onChange={(e) => setListingForm({ ...listingForm, logo_url: e.target.value })}
                  />
                </div>

                {/* Google Maps link */}
                <div className="space-y-1.5">
                  <Label>Google Maps Link</Label>
                  <Input
                    type="url"
                    placeholder="https://maps.google.com/…"
                    value={listingForm.maps_url}
                    onChange={(e) => setListingForm({ ...listingForm, maps_url: e.target.value })}
                  />
                </div>

                {/* Show member count toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-sidebar-border bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-medium text-foreground">Show active member count</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Display how many members are currently active on your listing.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setListingForm((f) => ({ ...f, show_member_count: !f.show_member_count }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                      listingForm.show_member_count ? "bg-[hsl(219_100%_50%)]" : "bg-muted"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      listingForm.show_member_count ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </button>
                </div>

                {/* Social Media */}
                <div className="space-y-3">
                  <Label>Social Media</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Instagram</p>
                      <Input
                        type="url"
                        placeholder="https://instagram.com/yourgym"
                        value={listingForm.instagram_url}
                        onChange={(e) => setListingForm({ ...listingForm, instagram_url: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">TikTok</p>
                      <Input
                        type="url"
                        placeholder="https://tiktok.com/@yourgym"
                        value={listingForm.tiktok_url}
                        onChange={(e) => setListingForm({ ...listingForm, tiktok_url: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Facebook</p>
                      <Input
                        type="url"
                        placeholder="https://facebook.com/yourgym"
                        value={listingForm.facebook_url}
                        onChange={(e) => setListingForm({ ...listingForm, facebook_url: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Short Description</Label>
                  <textarea
                    rows={3}
                    placeholder="Tell prospective members about your gym…"
                    value={listingForm.description}
                    onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Gym Type */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Gym Type</Label>
                    <span className="text-xs text-muted-foreground">Select all that apply</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GYM_TYPES.map((t) => {
                      const selected = listingForm.gym_types.includes(t.value as GymType);
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setListingForm((f) => ({
                            ...f,
                            gym_types: selected
                              ? f.gym_types.filter((x) => x !== t.value)
                              : [...f.gym_types, t.value as GymType],
                          }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selected
                              ? "bg-[hsl(219_100%_50%/0.1)] text-[hsl(219_100%_50%)] border-[hsl(219_100%_50%/0.3)]"
                              : "border-sidebar-border text-muted-foreground hover:text-foreground hover:border-sidebar-border/80"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Amenities */}
                <div className="space-y-2">
                  <Label>Amenities</Label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_AMENITIES.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAmenity(a)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          listingForm.amenities.includes(a)
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "border-sidebar-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button type="submit" disabled={savingListing} className="gap-2">
              {savingListing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Listing
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Payment Recovery */}
      <PaymentRecoverySection gym={gym} />

      <Separator />

      {/* Member Defaults */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Member Defaults</CardTitle>
          </div>
          <CardDescription>Configure automatic member status rules.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Defaulter Threshold</Label>
            <p className="text-xs text-muted-foreground">
              Members are auto-flagged as <span className="font-medium text-rose-400">Defaulter</span> after this many consecutive unpaid months.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={6}
                value={defaulterThreshold}
                onChange={(e) => setDefaulterThreshold(Number(e.target.value))}
                className="flex-1 accent-rose-500"
              />
              <span className="text-sm font-bold text-foreground w-16 text-center">
                {defaulterThreshold} month{defaulterThreshold !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
              {[1,2,3,4,5,6].map((n) => <span key={n}>{n}mo</span>)}
            </div>
          </div>
          <Button size="sm" onClick={saveDefaulterThreshold} disabled={savingDefaulter} className="gap-2">
            {savingDefaulter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Compliance Manager */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Compliance Manager</CardTitle>
          </div>
          <CardDescription>Create a limited-access account for compliance officers. They see a controlled subset of members — not actual business totals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!complianceLoaded ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : hasComplianceLogin ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {complianceUserName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{complianceUserName}</p>
                    <p className="text-xs text-muted-foreground">Compliance Officer · Active</p>
                    {complianceEmail && (
                      <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{complianceEmail}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setResetComplianceOpen(true); setResetCompliancePw(""); setResetComplianceDone(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 border border-primary/20 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Reset PW
                  </button>
                  <button
                    onClick={removeCompliance}
                    disabled={removingCompliance}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {removingCompliance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Remove Access
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Member Visibility — Percentage</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Self-Training Visible</Label>
                      <span className="text-sm font-semibold tabular-nums text-primary">{complianceForm.pct_self}%</span>
                    </div>
                    <input
                      type="range" min="1" max="100"
                      value={complianceForm.pct_self}
                      onChange={(e) => setComplianceForm((f) => ({ ...f, pct_self: e.target.value }))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      {complianceForm.pct_self}% of {complianceTotals.totalSelf} self members ={" "}
                      <span className="font-semibold text-foreground">
                        {Math.max(1, Math.floor(complianceTotals.totalSelf * Number(complianceForm.pct_self) / 100))} shown
                      </span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Personal Training Visible</Label>
                      <span className="text-sm font-semibold tabular-nums text-primary">{complianceForm.pct_pt}%</span>
                    </div>
                    <input
                      type="range" min="1" max="100"
                      value={complianceForm.pct_pt}
                      onChange={(e) => setComplianceForm((f) => ({ ...f, pct_pt: e.target.value }))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      {complianceForm.pct_pt}% of {complianceTotals.totalPt} PT members ={" "}
                      <span className="font-semibold text-foreground">
                        {Math.max(1, Math.floor(complianceTotals.totalPt * Number(complianceForm.pct_pt) / 100))} shown
                      </span>
                    </p>
                  </div>
                </div>
                <Button onClick={saveComplianceLimits} disabled={savingCompliance} className="mt-4 gap-2">
                  {savingCompliance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Limits
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">No compliance login yet. Create one below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input placeholder="Compliance Officer" value={complianceForm.full_name} onChange={(e) => setComplianceForm((f) => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" placeholder="compliance@example.com" value={complianceForm.email} onChange={(e) => setComplianceForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showCompliancePass ? "text" : "password"}
                      placeholder="Strong password"
                      value={complianceForm.password}
                      onChange={(e) => setComplianceForm((f) => ({ ...f, password: e.target.value }))}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowCompliancePass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showCompliancePass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Self-Training Visible</Label>
                    <span className="text-sm font-semibold tabular-nums text-primary">{complianceForm.pct_self}%</span>
                  </div>
                  <input
                    type="range" min="1" max="100"
                    value={complianceForm.pct_self}
                    onChange={(e) => setComplianceForm((f) => ({ ...f, pct_self: e.target.value }))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    {complianceForm.pct_self}% of {complianceTotals.totalSelf} self members ={" "}
                    <span className="font-semibold text-foreground">
                      {Math.max(1, Math.floor(complianceTotals.totalSelf * Number(complianceForm.pct_self) / 100))} shown
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Personal Training Visible</Label>
                    <span className="text-sm font-semibold tabular-nums text-primary">{complianceForm.pct_pt}%</span>
                  </div>
                  <input
                    type="range" min="1" max="100"
                    value={complianceForm.pct_pt}
                    onChange={(e) => setComplianceForm((f) => ({ ...f, pct_pt: e.target.value }))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    {complianceForm.pct_pt}% of {complianceTotals.totalPt} PT members ={" "}
                    <span className="font-semibold text-foreground">
                      {Math.max(1, Math.floor(complianceTotals.totalPt * Number(complianceForm.pct_pt) / 100))} shown
                    </span>
                  </p>
                </div>
              </div>
              <Button onClick={createCompliance} disabled={savingCompliance} className="gap-2">
                {savingCompliance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Create Compliance Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Your Profile</CardTitle>
          </div>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
            </div>
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="Your name"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={savingProfile} className="gap-2">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Change Password</CardTitle>
          </div>
          <CardDescription>Requires your current password to confirm the change</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPw ? "text" : "password"}
                  placeholder="Enter current password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                  required
                  className="pr-9"
                />
                <button type="button" onClick={() => setShowCurrentPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPw ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={pwForm.next}
                    onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                    required
                    minLength={8}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Repeat new password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                />
              </div>
            </div>
            {pwForm.next && pwForm.confirm && pwForm.next !== pwForm.confirm && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
            <Button
              type="submit"
              disabled={savingPw || (!!pwForm.next && !!pwForm.confirm && pwForm.next !== pwForm.confirm)}
              className="gap-2"
            >
              {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Reset Compliance Password Dialog ─────────────── */}
      <Dialog open={resetComplianceOpen} onOpenChange={(o) => { if (!o) { setResetComplianceOpen(false); setResetCompliancePw(""); setResetComplianceDone(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{resetComplianceDone ? "Password Reset" : `Reset Password — ${complianceUserName}`}</DialogTitle>
          </DialogHeader>
          {resetComplianceDone ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-400">
                Password reset successfully for {complianceUserName}.
              </div>
              <div className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 space-y-1 text-sm">
                {complianceEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-mono font-medium">{complianceEmail}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">New Password</span><span className="font-mono font-medium">{resetCompliancePw}</span></div>
              </div>
              <DialogFooter><Button className="w-full" onClick={() => { setResetComplianceOpen(false); setResetComplianceDone(false); }}>Done</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>New Password *</Label>
                  <button type="button" onClick={() => { const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$!"; setResetCompliancePw(Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join("")); }} className="text-xs text-primary hover:underline">Auto-generate</button>
                </div>
                <Input type="text" placeholder="Min 8 characters" value={resetCompliancePw} onChange={(e) => setResetCompliancePw(e.target.value)} className="font-mono" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetComplianceOpen(false)}>Cancel</Button>
                <Button onClick={handleResetCompliancePassword} disabled={resetComplianceSaving || resetCompliancePw.length < 8}>
                  {resetComplianceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Reset Password
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
