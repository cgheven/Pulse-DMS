import { whatsappUrl as buildWhatsappUrl } from "@/lib/whatsapp-reminder";

export interface ProspectTemplate {
  key: string;          // stable id, stored in DB
  label: string;        // shown in picker
  description: string;  // 1-line context for when to use
  body: string;         // raw template w/ placeholders
}

export const PROSPECT_TEMPLATES: ProspectTemplate[] = [
  {
    key: "intro_cold",
    label: "Cold intro pitch",
    description: "First outreach — no prior contact",
    body: `Hi {ownerName}, this is {sender} from Pulse GMS.

We help gym owners in {city} run member billing, attendance, and reminders from one simple dashboard — designed specifically for Pakistani gyms.

Would you be open to a quick 10-minute call this week to see if it could save time at {gym}?

Thanks for your time.`,
  },
  {
    key: "intro_warm",
    label: "Warm intro (referral / visit)",
    description: "After in-person visit or mutual contact",
    body: `Hi {ownerName}, this is {sender} from Pulse GMS.

Great speaking with you {dayRef}. As discussed, Pulse helps gyms like {gym} automate fee reminders, track attendance, and reduce paperwork.

I've put together a quick walkthrough — when would be a good time to share it with you?`,
  },
  {
    key: "followup_no_response",
    label: "Follow-up — no response yet",
    description: "Polite nudge after first message went unanswered",
    body: `Hi {ownerName}, just following up on my earlier message about Pulse GMS for {gym}.

We're currently offering a free 60-day pilot so you can try the system risk-free. Happy to send a short demo if helpful.

Let me know if there's a better time to connect.`,
  },
  {
    key: "followup_after_visit",
    label: "Follow-up — after visit/demo",
    description: "Thank-you + next-step after meeting in person",
    body: `Hi {ownerName}, thank you for taking the time to meet today.

To recap — Pulse GMS will handle member fees, WhatsApp reminders, attendance, and trainer payouts for {gym}, starting with a free 60-day trial.

I'll send the onboarding link shortly. Let me know if you have any questions in the meantime.`,
  },
  {
    key: "final_nudge",
    label: "Final nudge",
    description: "Last polite touch — \"closing the loop\"",
    body: `Hi {ownerName}, I wanted to close the loop on our earlier conversation about Pulse GMS for {gym}.

If timing isn't right at the moment, no problem at all — I'll keep your details on file and check back in a few weeks.

Wishing you and your team the best.`,
  },
];

export function getTemplate(key: string): ProspectTemplate | undefined {
  return PROSPECT_TEMPLATES.find((t) => t.key === key);
}

interface FillArgs {
  ownerName?: string | null;
  gym: string;
  city?: string | null;
  sender?: string | null;
  dayRef?: string; // "earlier", "yesterday", etc.
}

export function fillTemplate(body: string, args: FillArgs): string {
  const ownerName = (args.ownerName ?? "").trim();
  const firstName = ownerName ? ownerName.split(" ")[0] : "there";
  return body
    .replace(/\{ownerName\}/g, firstName)
    .replace(/\{gym\}/g, args.gym)
    .replace(/\{city\}/g, args.city ?? "your area")
    .replace(/\{sender\}/g, args.sender ?? "the Pulse team")
    .replace(/\{dayRef\}/g, args.dayRef ?? "earlier");
}

// Re-export for convenience
export { buildWhatsappUrl };
