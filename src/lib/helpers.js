// ---------- helpers ----------
// Pure functions and constants shared across the app. No logic was changed
// during the Tailwind/component refactor — this is a straight lift from the
// original single-file version.

export const uid = () => Math.random().toString(36).slice(2, 10);

export const money = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

export const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// Adds `months` to an ISO date string ("YYYY-MM-DD"), returning another ISO
// date string. Built on local midnight (matching fmtDate's parsing) so it's
// not affected by the browser's timezone. Overflowing the target month's day
// count (e.g. Jan 31 + 1 month) rolls forward per native Date behavior —
// e.g. "2026-01-31" + 1 month becomes "2026-03-03", not "2026-02-28".
export function addMonths(iso, months) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + num(months), d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
// export const STATUS = {
//   draft: { label: "Draft", color: "#7A7566", bg: "#EDEAE2" },
//   sent: { label: "Sent", color: "#3D6B5C", bg: "#E3EDE8" },
//   paid: { label: "Paid", color: "#1B2A3D", bg: "#E0E5EC" },
//   overdue: { label: "Overdue", color: "#B5482F", bg: "#F5E4DE" },
//   accepted: { label: "Accepted", color: "#3D6B5C", bg: "#E3EDE8" },
//   declined: { label: "Declined", color: "#B5482F", bg: "#F5E4DE" },
// };

export const STATUS = {
  draft: { label: "Draft", color: "#6B7280", bg: "#E5E7EB" },
  sent: { label: "Sent", color: "#0369A1", bg: "#DBEAFE" },
  paid: { label: "Paid", color: "#15803D", bg: "#D1FAE5" },
  overdue: { label: "Overdue", color: "#B91C1C", bg: "#FEE2E2" },
  accepted: { label: "Accepted", color: "#15803D", bg: "#D1FAE5" },
  declined: { label: "Declined", color: "#B91C1C", bg: "#FEE2E2" },
  received: { label: "Received", color: "#7E22CE", bg: "#F3E8FF" },
  cancelled: { label: "Cancelled", color: "#B91C1C", bg: "#FEE2E2" },
};

export function effectiveStatus(inv) {
  if (inv.docType === "quotation") return inv.status;
  if (inv.status === "paid" || inv.status === "draft") return inv.status;
  if (inv.dueDate && inv.dueDate < todayISO()) return "overdue";
  return inv.status;
}

export function nextDocNumber(invoices, docType) {
  const year = new Date().getFullYear();
  if (docType === "quotation") {
    const nums = invoices
      .filter((i) => i.docType === "quotation")
      .map((i) => i.quoteNumber)
      .filter((n) => n && n.startsWith(`QUO-${year}-`))
      .map((n) => parseInt(n.split("-")[2], 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `QUO-${year}-${String(next).padStart(4, "0")}`;
  }
  if (docType === "receipt") {
    const nums = invoices
      .filter((i) => i.docType === "receipt")
      .map((i) => i.quoteNumber)
      .filter((n) => n && n.startsWith(`RCT-${year}-`))
      .map((n) => parseInt(n.split("-")[2], 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `RCT-${year}-${String(next).padStart(4, "0")}`;
  }
  const nums = invoices
    .filter((i) => (i.docType || "invoice") === "invoice")
    .map((i) => i.quoteNumber)
    .filter((n) => n && n.startsWith(`${year}`))
    .map((n) => parseInt(n.slice(4), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${year}${String(next).padStart(4, "0")}`;
}

// row = { id, kind: 'item' | 'section', label?, no, desc, code, w, h, qty, m2, rate }
export function rowAmount(row) {
  const m2 = num(row.m2);
  const qty = num(row.qty);
  const rate = num(row.rate);
  const basis = m2 > 0 ? m2 : qty;
  return basis * rate;
}

export function suggestM2(row) {
  const w = num(row.w), h = num(row.h), qty = num(row.qty) || 1;
  if (!w || !h) return row.m2 || "";
  return (((w * h) / 10000) * qty).toFixed(2);
}

export function calcTotals(inv) {
  const subtotal = (inv.rows || []).filter((r) => r.kind === "item").reduce((s, r) => s + rowAmount(r), 0);
  const discount = num(inv.discount);
  const afterDiscount = Math.max(subtotal - discount, 0);
  const depositMode = inv.depositMode || "percent";
  const depositValue = inv.depositValue !== undefined && inv.depositValue !== "" ? inv.depositValue : inv.depositPct;
  const depositAmtRaw = depositMode === "amount" ? num(depositValue) : afterDiscount * (num(depositValue) / 100);
  const depositAmt = Math.max(Math.min(depositAmtRaw, afterDiscount), 0);
  const total = afterDiscount - depositAmt;
  return { subtotal, discount, depositAmt, total, depositMode, depositValue: num(depositValue) };
}

export function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}
export function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}
export function lastNMonthKeys(n) {
  const arr = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

export const DEFAULT_SETTINGS = {
  businessName: "Your Business",
  tagline: "",
  address: "",
  phone: "",
  sellerName: "",
  logoDataUrl: "",
  terms: "- Goods cannot be refunded\n- Leadtime 10-15 days after confirmed",
  thanksNote: "Thank you for your business!",
  exchangeRate: "",
  showKHR: false,
  khqrPayload: "",
  authMode: "none",
  pinCode: "",
  users: [],
};

export const ITEM_UNITS = [
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "pcs", label: "pcs" },
  { value: "ea", label: "ea" },
  { value: "set", label: "set" },
];
export const ITEM_CATEGORIES = ["Curtain", "Blinds"];
// export const CATEGORY_COLORS = {
//   Curtain: { color: "#8A6D3D", bg: "#F3EBDA" },
//   Blinds: { color: "#3D6B5C", bg: "#E3EDE8" },
// };

export const CATEGORY_COLORS = {
  Curtain: { color: "#B45309", bg: "#FEF3C7" },
  Blinds: { color: "#0369A1", bg: "#DBEAFE" },
};


export function marginPct(rate, cost) {
  const r = num(rate), c = num(cost);
  if (r <= 0) return 0;
  return ((r - c) / r) * 100;
}

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque", "Other"];
// A lightweight, non-React warning banner — used when something needs to
// surface a message (like a failed save) from outside component state,
// e.g. a callback chained onto a save promise. Self-removing after 4.5s.
export function showInPageMessage(msg) {
  try {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1B2A3D;color:#FAF8F3;padding:12px 18px;border-radius:6px;font-family:sans-serif;font-size:13px;max-width:88vw;text-align:center;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,0.25);";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  } catch (e) {
    // Last resort only if DOM manipulation itself is unavailable
    try { alert(msg); } catch (e2) {}
  }
}

export function shareViaWhatsApp(text, phone) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
}
export function shareViaTelegram(text) {
  window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, "_blank");
}