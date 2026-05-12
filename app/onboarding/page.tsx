import type { Metadata } from "next";
import OnboardingClient from "./onboarding-client";

export const metadata: Metadata = {
  title: "Get Started with Pulse — Gym Management Software",
  description:
    "Apply for a free trial of Pulse — the gym management software built for Pakistan. Tell us about your gym and we'll get you set up.",
};

// Keep this page fully dynamic — request headers (ip, user-agent) are used
// during the server action invoked from this route.
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingClient />;
}
