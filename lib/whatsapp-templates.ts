import { toIntlNoPlus, normalizePhone } from "@/lib/phone";

export function shareStaffCredentialsViaWhatsApp(opts: {
  fullName: string;
  phone: string;
  password: string;
  shopName: string;
}): void {
  const { fullName, phone, password, shopName } = opts;
  const canonical = normalizePhone(phone) ?? phone.replace(/[^0-9]/g, "");
  const safe = canonical.startsWith("0") ? canonical : "0" + canonical;
  const intl = toIntlNoPlus(safe);

  const msg = [
    "Assalam-o-Alaikum " + fullName + "!",
    "",
    shopName + " ki taraf se aap ko Pulse DMS ka access de diya gaya hai.",
    "",
    "Login ID (Mobile): " + safe,
    "Password: " + password,
    "",
    "Login karein: https://dms.yourpulse.io/login",
    "",
    "Kisi bhi maslay ke liye apne manager se rabta karein.",
  ].join("\n");

  const url = "https://wa.me/" + intl + "?text=" + encodeURIComponent(msg);
  window.open(url, "_blank", "noopener,noreferrer");
}
