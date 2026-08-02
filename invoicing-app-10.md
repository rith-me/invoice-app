import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Trash2, FileText, Users, ArrowLeft, Printer, Check, Send, X, Settings as SettingsIcon, Rows3, LayoutDashboard, TrendingUp, AlertTriangle, Percent, Package, Upload, Download, Truck, Receipt, BarChart3, CalendarDays, ShieldCheck, MessageCircle, Share2, RotateCcw } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const money = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const khr = (usdAmount, rate) => {
  const r = Number(rate) || 0;
  const v = Math.round((isFinite(usdAmount) ? usdAmount : 0) * r);
  return `៛${v.toLocaleString()}`;
};
const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const STATUS = {
  draft: { label: "Draft", color: "#7A7566", bg: "#EDEAE2" },
  sent: { label: "Sent", color: "#3D6B5C", bg: "#E3EDE8" },
  paid: { label: "Paid", color: "#1B2A3D", bg: "#E0E5EC" },
  overdue: { label: "Overdue", color: "#B5482F", bg: "#F5E4DE" },
  accepted: { label: "Accepted", color: "#3D6B5C", bg: "#E3EDE8" },
  declined: { label: "Declined", color: "#B5482F", bg: "#F5E4DE" },
  received: { label: "Received", color: "#1B2A3D", bg: "#E0E5EC" },
  cancelled: { label: "Cancelled", color: "#B5482F", bg: "#F5E4DE" },
};

function effectiveStatus(inv) {
  if (inv.docType === "quotation" || inv.docType === "po") return inv.status;
  if (inv.status === "paid" || inv.status === "draft") return inv.status;
  if (inv.dueDate && inv.dueDate < todayISO()) return "overdue";
  return inv.status;
}

function nextDocNumber(invoices, docType) {
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
  if (docType === "po") {
    const nums = invoices
      .filter((i) => i.docType === "po")
      .map((i) => i.quoteNumber)
      .filter((n) => n && n.startsWith(`PO-${year}-`))
      .map((n) => parseInt(n.split("-")[2], 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `PO-${year}-${String(next).padStart(4, "0")}`;
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

function generateDueRecurring(invoices) {
  const today = todayISO();
  let working = [...invoices];
  let generatedCount = 0;
  invoices.forEach((template) => {
    if (template.docType !== "invoice" || !template.recurring || !template.recurring.enabled) return;
    let nextDate = template.recurring.nextDate;
    if (!nextDate || nextDate > today) return;
    const id = uid();
    const clone = {
      ...template,
      id,
      quoteNumber: nextDocNumber(working, "invoice"),
      issueDate: today,
      dueDate: "",
      status: "draft",
      payments: [],
      photos: [],
      stockDeducted: false,
      recurring: { enabled: false, frequency: "monthly", nextDate: "" },
      rows: (template.rows || []).map((r) => ({ ...r, id: uid() })),
    };
    working = [clone, ...working];
    generatedCount++;
    while (nextDate <= today) nextDate = advanceByFrequency(nextDate, template.recurring.frequency);
    working = working.map((i) => (i.id === template.id ? { ...i, recurring: { ...i.recurring, nextDate } } : i));
  });
  return { invoices: working, generatedCount };
}

// row = { id, kind: 'item' | 'section', label?, no, desc, code, w, h, qty, m2, rate }
function rowAmount(row) {
  const m2 = num(row.m2);
  const qty = num(row.qty);
  const rate = num(row.rate);
  const basis = m2 > 0 ? m2 : qty;
  return basis * rate;
}
function suggestM2(row) {
  const w = num(row.w), h = num(row.h), qty = num(row.qty) || 1;
  if (!w || !h) return row.m2 || "";
  return (((w * h) / 10000) * qty).toFixed(2);
}

function calcTotals(inv) {
  const subtotal = (inv.rows || []).filter((r) => r.kind === "item").reduce((s, r) => s + rowAmount(r), 0);
  const discount = num(inv.discount);
  const afterDiscount = Math.max(subtotal - discount, 0);
  const taxMode = inv.taxMode || "percent";
  const taxValue = num(inv.taxValue);
  const taxAmt = taxMode === "amount" ? taxValue : afterDiscount * (taxValue / 100);
  const afterTax = afterDiscount + taxAmt;
  const depositMode = inv.depositMode || "percent";
  const depositValue = inv.depositValue !== undefined && inv.depositValue !== "" ? inv.depositValue : inv.depositPct;
  const depositAmtRaw = depositMode === "amount" ? num(depositValue) : afterTax * (num(depositValue) / 100);
  const depositAmt = Math.max(Math.min(depositAmtRaw, afterTax), 0);
  const total = afterTax - depositAmt;
  const amountPaid = (inv.payments || []).reduce((s, p) => s + num(p.amount), 0);
  const balanceDue = Math.max(total - amountPaid, 0);
  return { subtotal, discount, taxMode, taxValue, taxAmt, depositAmt, total, depositMode, depositValue: num(depositValue), amountPaid, balanceDue };
}

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}
function lastNMonthKeys(n) {
  const arr = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

// ---------- storage ----------
const K_CLIENTS = "clients";
const K_INVOICES = "invoices";
const K_SETTINGS = "settings";
const K_ITEMS = "items";
const K_EXPENSES = "expenses";
const K_SCHEDULE = "schedule";
const K_TRASH = "trash";
const DEFAULT_SETTINGS = {
  businessName: "Your Business",
  tagline: "",
  address: "",
  phone: "",
  sellerName: "",
  logoDataUrl: "",
  terms: "- Goods cannot be refunded\n- Leadtime 10-15 days after confirmed",
  thanksNote: "Thank you for your business!",
  exchangeRate: 4100,
  showKHR: false,
  pinCode: "",
  khqrPayload: "",
  authMode: "none",
  users: [],
};

async function loadAll() {
  const out = { clients: [], invoices: [], settings: DEFAULT_SETTINGS, items: [], expenses: [], schedule: [], trash: [] };
  try {
    const c = await window.storage.get(K_CLIENTS);
    if (c) out.clients = JSON.parse(c.value);
  } catch (e) {}
  try {
    const i = await window.storage.get(K_INVOICES);
    if (i) out.invoices = JSON.parse(i.value);
  } catch (e) {}
  try {
    const s = await window.storage.get(K_SETTINGS);
    if (s) out.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s.value) };
  } catch (e) {}
  try {
    const it = await window.storage.get(K_ITEMS);
    if (it) out.items = JSON.parse(it.value);
  } catch (e) {}
  try {
    const ex = await window.storage.get(K_EXPENSES);
    if (ex) out.expenses = JSON.parse(ex.value);
  } catch (e) {}
  try {
    const sc = await window.storage.get(K_SCHEDULE);
    if (sc) out.schedule = JSON.parse(sc.value);
  } catch (e) {}
  try {
    const tr = await window.storage.get(K_TRASH);
    if (tr) out.trash = JSON.parse(tr.value);
  } catch (e) {}
  return out;
}
async function saveClients(clients) {
  try { await window.storage.set(K_CLIENTS, JSON.stringify(clients)); } catch (e) { console.error(e); }
}
async function saveInvoices(invoices) {
  try { await window.storage.set(K_INVOICES, JSON.stringify(invoices)); } catch (e) { console.error(e); }
}
async function saveSettings(settings) {
  try { await window.storage.set(K_SETTINGS, JSON.stringify(settings)); } catch (e) { console.error(e); }
}
async function saveItems(items) {
  try { await window.storage.set(K_ITEMS, JSON.stringify(items)); } catch (e) { console.error(e); }
}
async function saveExpenses(expenses) {
  try { await window.storage.set(K_EXPENSES, JSON.stringify(expenses)); } catch (e) { console.error(e); }
}
async function saveSchedule(schedule) {
  try { await window.storage.set(K_SCHEDULE, JSON.stringify(schedule)); } catch (e) { console.error(e); }
}
async function saveTrash(trash) {
  try { await window.storage.set(K_TRASH, JSON.stringify(trash)); } catch (e) { console.error(e); }
}

// ---------- UI atoms ----------
function Badge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: s.color, background: s.bg, padding: "3px 8px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", marginBottom: 14, ...style }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8574", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
const inputStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid #DAD5C6", borderRadius: 4,
  padding: "8px 10px", fontSize: 14, fontFamily: "'Source Serif 4','Noto Sans Khmer',Georgia,serif",
  background: "#FFFDF9", color: "#1B2A3D", outline: "none",
};
function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

// ---------- main app ----------
export default function InvoicingApp() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [trash, setTrash] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [showForgotLogin, setShowForgotLogin] = useState(false);
  const [view, setView] = useState("dashboard");
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAll().then((data) => {
      setClients(data.clients);
      const { invoices: nextInvoices, generatedCount } = generateDueRecurring(data.invoices);
      setInvoices(nextInvoices);
      if (generatedCount > 0) {
        saveInvoices(nextInvoices);
        setTimeout(() => showToast(`Generated ${generatedCount} recurring invoice${generatedCount === 1 ? "" : "s"}`), 600);
      }
      setSettings(data.settings);
      setItems(data.items);
      setExpenses(data.expenses);
      setSchedule(data.schedule);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const keptTrash = (data.trash || []).filter((t) => new Date(t.deletedAt).getTime() >= cutoff);
      setTrash(keptTrash);
      if (keptTrash.length !== (data.trash || []).length) saveTrash(keptTrash);
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const updateInvoices = useCallback((next) => { setInvoices(next); saveInvoices(next); }, []);
  const updateClients = useCallback((next) => { setClients(next); saveClients(next); }, []);
  const updateSettings = useCallback((next) => { setSettings(next); saveSettings(next); }, []);
  const updateItems = useCallback((next) => { setItems(next); saveItems(next); }, []);
  const updateExpenses = useCallback((next) => { setExpenses(next); saveExpenses(next); }, []);
  const updateSchedule = useCallback((next) => { setSchedule(next); saveSchedule(next); }, []);
  const updateTrash = useCallback((next) => { setTrash(next); saveTrash(next); }, []);

  const moveToTrash = useCallback((type, label, record) => {
    setTrash((cur) => {
      const next = [{ id: uid(), type, label, record, deletedAt: new Date().toISOString() }, ...cur];
      saveTrash(next);
      return next;
    });
  }, []);

  function restoreFromTrash(trashId) {
    const entry = trash.find((t) => t.id === trashId);
    if (!entry) return;
    if (entry.type === "client") updateClients([entry.record, ...clients]);
    else if (entry.type === "item") updateItems([entry.record, ...items]);
    else if (entry.type === "expense") updateExpenses([entry.record, ...expenses]);
    else if (entry.type === "schedule") updateSchedule([entry.record, ...schedule]);
    else updateInvoices([entry.record, ...invoices]);
    updateTrash(trash.filter((t) => t.id !== trashId));
    showToast("Restored");
  }
  function deleteForever(trashId) {
    updateTrash(trash.filter((t) => t.id !== trashId));
  }
  function emptyTrash() {
    updateTrash([]);
    showToast("Trash emptied");
  }

  const activeInvoice = useMemo(() => invoices.find((i) => i.id === activeInvoiceId) || null, [invoices, activeInvoiceId]);

  function createDoc(docType) {
    const id = uid();
    let inv;
    if (docType === "receipt") {
      inv = {
        id,
        docType,
        quoteNumber: nextDocNumber(invoices, docType),
        issueDate: todayISO(),
        clientId: clients[0]?.id || null,
        clientName: clients[0]?.name || "",
        clientAddress: clients[0]?.address || "",
        clientPhone: clients[0]?.phone || "",
        invoiceRef: "",
        amountReceived: 0,
        paymentMethod: "Cash",
        balanceRemaining: 0,
        notes: "",
      };
    } else {
      inv = {
        id,
        docType,
        quoteNumber: nextDocNumber(invoices, docType),
        customerId: "",
        issueDate: todayISO(),
        dueDate: "",
        expectedDate: "",
        status: "draft",
        clientId: docType === "po" ? null : (clients[0]?.id || null),
        clientName: docType === "po" ? "" : (clients[0]?.name || ""),
        clientAddress: docType === "po" ? "" : (clients[0]?.address || ""),
        clientPhone: docType === "po" ? "" : (clients[0]?.phone || ""),
        rows: [{ id: uid(), kind: "item", desc: "", code: "", w: "", h: "", qty: 1, unit: "", m2: "", rate: 0 }],
        discount: 0,
        taxMode: "percent",
        taxValue: 0,
        depositMode: "percent",
        depositValue: 0,
        payments: [],
        photos: [],
        notes: "",
      };
    }
    updateInvoices([inv, ...invoices]);
    setActiveInvoiceId(id);
    setView("invoice-edit");
  }

  function convertToInvoice(quotationId) {
    const source = invoices.find((i) => i.id === quotationId);
    if (!source) return;
    const id = uid();
    const inv = {
      ...source,
      id,
      docType: "invoice",
      quoteNumber: nextDocNumber(invoices, "invoice"),
      status: "draft",
      issueDate: todayISO(),
      rows: source.rows.map((r) => ({ ...r, id: uid() })),
    };
    updateInvoices([inv, ...invoices]);
    setActiveInvoiceId(id);
    setView("invoice-view");
    showToast(`Created invoice ${inv.quoteNumber} from quotation`);
  }

  function convertToReceipt(invoiceId) {
    const source = invoices.find((i) => i.id === invoiceId);
    if (!source) return;
    const { total } = calcTotals(source);
    const id = uid();
    const receipt = {
      id,
      docType: "receipt",
      quoteNumber: nextDocNumber(invoices, "receipt"),
      issueDate: todayISO(),
      clientId: source.clientId,
      clientName: source.clientName,
      clientAddress: source.clientAddress,
      clientPhone: source.clientPhone,
      invoiceRef: source.quoteNumber,
      amountReceived: +total.toFixed(2),
      paymentMethod: "Cash",
      balanceRemaining: 0,
      notes: "",
    };
    updateInvoices([receipt, ...invoices]);
    setActiveInvoiceId(id);
    setView("invoice-view");
    showToast(`Created receipt ${receipt.quoteNumber} from invoice`);
  }

  function deleteInvoice(id) {
    const doc = invoices.find((i) => i.id === id);
    if (doc && doc.docType === "invoice" && doc.stockDeducted) {
      adjustStock(doc, 1);
    }
    updateInvoices(invoices.filter((i) => i.id !== id));
    if (doc) {
      const typeLabel = doc.docType === "quotation" ? "Quotation" : doc.docType === "receipt" ? "Receipt" : doc.docType === "po" ? "Purchase order" : "Invoice";
      moveToTrash(doc.docType || "invoice", `${typeLabel} ${doc.quoteNumber}${doc.clientName ? ` — ${doc.clientName}` : ""}`, doc);
    }
    if (activeInvoiceId === id) {
      const dt = doc?.docType;
      setView(dt === "quotation" ? "quotations" : dt === "receipt" ? "receipts" : dt === "po" ? "purchase-orders" : "invoices");
    }
  }
  function patchInvoice(id, patch) {
    updateInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function adjustStock(doc, sign) {
    const updates = {};
    (doc.rows || []).filter((r) => r.kind === "item").forEach((r) => {
      const match = items.find((it) => {
        if (r.code && it.code) return it.code.trim().toLowerCase() === r.code.trim().toLowerCase();
        return it.desc.trim().toLowerCase() === (r.desc || "").trim().toLowerCase();
      });
      if (!match) return;
      const qty = num(r.m2) > 0 ? num(r.m2) : num(r.qty);
      updates[match.id] = (updates[match.id] !== undefined ? updates[match.id] : num(match.stock)) + sign * qty;
    });
    if (Object.keys(updates).length === 0) return false;
    updateItems(items.map((it) => (updates[it.id] !== undefined ? { ...it, stock: +updates[it.id].toFixed(2) } : it)));
    return true;
  }

  function handleStatusChange(id, status) {
    const doc = invoices.find((i) => i.id === id);
    const patch = { status };
    if (doc && doc.docType === "invoice" && status !== "draft" && !doc.stockDeducted) {
      const did = adjustStock(doc, -1);
      if (did) {
        patch.stockDeducted = true;
        showToast("Inventory deducted for this invoice");
      }
    }
    patchInvoice(id, patch);
    if (doc && doc.docType === "po" && status === "received" && doc.status !== "received") {
      const did = adjustStock(doc, 1);
      if (did) showToast(`Stock received for ${doc.quoteNumber}`);
    }
  }

  function addPayment(id, payment) {
    const doc = invoices.find((i) => i.id === id);
    if (!doc) return;
    const payments = [...(doc.payments || []), { id: uid(), date: todayISO(), method: "Cash", ...payment }];
    const { total } = calcTotals({ ...doc, payments });
    const amountPaid = payments.reduce((s, p) => s + num(p.amount), 0);
    const patch = { payments };
    if (amountPaid >= total - 0.005) {
      patch.status = "paid";
      if (doc.docType === "invoice" && !doc.stockDeducted) {
        const did = adjustStock(doc, -1);
        if (did) patch.stockDeducted = true;
      }
      showToast("Payment recorded — fully paid");
    } else {
      if (doc.status === "draft") patch.status = "sent";
      showToast("Payment recorded");
    }
    patchInvoice(id, patch);
  }
  function removePayment(id, paymentId) {
    const doc = invoices.find((i) => i.id === id);
    if (!doc) return;
    patchInvoice(id, { payments: (doc.payments || []).filter((p) => p.id !== paymentId), status: doc.status === "paid" ? "sent" : doc.status });
  }

  const totalsSummary = useMemo(() => {
    let outstanding = 0, paid = 0;
    invoices.filter((inv) => (inv.docType || "invoice") === "invoice").forEach((inv) => {
      const { total } = calcTotals(inv);
      if (inv.status === "paid") paid += total;
      else outstanding += total;
    });
    return { outstanding, paid };
  }, [invoices]);

  if (loading) {
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#8A8574", fontSize: 13 }}>Loading ledger…</div>
      </div>
    );
  }

  if (settings.authMode === "users" && settings.users.length > 0 && !unlocked) {
    const submitLogin = () => {
      const match = settings.users.find(
        (u) => u.username.trim().toLowerCase() === loginUsername.trim().toLowerCase() && u.password === loginPassword
      );
      if (match) {
        setCurrentUser(match);
        setUnlocked(true);
      } else {
        setLoginError(true);
        setLoginPassword("");
      }
    };
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <style>{fontImport}</style>
        <div style={{ width: 280, textAlign: "center" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#1B2A3D", marginBottom: 4 }}>{settings.businessName}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8A8574", marginBottom: 20 }}>Sign in to continue</div>
          <div style={{ textAlign: "left", marginBottom: 12 }}>
            <TextInput
              autoFocus
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setLoginError(false); }}
              placeholder="Username"
              style={{ marginBottom: 10, borderColor: loginError ? "#B5482F" : "#DAD5C6" }}
            />
            <TextInput
              type="password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setLoginError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitLogin(); }}
              placeholder="Password"
              style={{ borderColor: loginError ? "#B5482F" : "#DAD5C6" }}
            />
          </div>
          {loginError && <div style={{ color: "#B5482F", fontSize: 12, marginBottom: 10 }}>Incorrect username or password</div>}
          <button
            onClick={submitLogin}
            style={{ width: "100%", background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "10px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}
          >
            Sign in
          </button>

          {!showForgotLogin ? (
            <button onClick={() => setShowForgotLogin(true)} style={{ background: "none", border: "none", color: "#8A8574", fontSize: 12, marginTop: 14, textDecoration: "underline" }}>
              Forgot password?
            </button>
          ) : (
            <div style={{ marginTop: 16, padding: 14, border: "1px solid #E4DFD3", borderRadius: 6, background: "#FFFDF9", textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "#6E6A5C", marginBottom: 10 }}>This turns off login requirements so you can get back in. Your data isn't affected — you can manage accounts again from Business info afterward.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowForgotLogin(false)} style={{ flex: 1, background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", fontSize: 12.5 }}>Cancel</button>
                <button
                  onClick={() => {
                    updateSettings({ ...settings, authMode: "none" });
                    setUnlocked(true);
                    setShowForgotLogin(false);
                    setLoginUsername("");
                    setLoginPassword("");
                    setLoginError(false);
                  }}
                  style={{ flex: 1, background: "#B5482F", color: "#FAF8F3", border: "none", borderRadius: 5, padding: "7px 10px", fontSize: 12.5, fontWeight: 600 }}
                >
                  Turn off login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (settings.authMode !== "users" && settings.pinCode && !unlocked) {
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <style>{fontImport}</style>
        <div style={{ width: 260, textAlign: "center" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#1B2A3D", marginBottom: 4 }}>{settings.businessName}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8A8574", marginBottom: 20 }}>Enter PIN to continue</div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pinInput === settings.pinCode) setUnlocked(true);
                else { setPinError(true); setPinInput(""); }
              }
            }}
            style={{ ...inputStyle, textAlign: "center", fontSize: 20, letterSpacing: "0.3em", marginBottom: 10, borderColor: pinError ? "#B5482F" : "#DAD5C6" }}
            placeholder="••••"
          />
          {pinError && <div style={{ color: "#B5482F", fontSize: 12, marginBottom: 10 }}>Incorrect PIN</div>}
          <button
            onClick={() => {
              if (pinInput === settings.pinCode) setUnlocked(true);
              else { setPinError(true); setPinInput(""); }
            }}
            style={{ width: "100%", background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "10px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}
          >
            Unlock
          </button>

          {!showForgotPin ? (
            <button onClick={() => setShowForgotPin(true)} style={{ background: "none", border: "none", color: "#8A8574", fontSize: 12, marginTop: 14, textDecoration: "underline" }}>
              Forgot PIN?
            </button>
          ) : (
            <div style={{ marginTop: 16, padding: 14, border: "1px solid #E4DFD3", borderRadius: 6, background: "#FFFDF9", textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "#6E6A5C", marginBottom: 10 }}>This removes the PIN lock so you can get back in. Your data isn't affected — you can set a new PIN afterward from Business info.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowForgotPin(false)} style={{ flex: 1, background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", fontSize: 12.5 }}>Cancel</button>
                <button
                  onClick={() => {
                    updateSettings({ ...settings, pinCode: "" });
                    setUnlocked(true);
                    setShowForgotPin(false);
                    setPinInput("");
                    setPinError(false);
                  }}
                  style={{ flex: 1, background: "#B5482F", color: "#FAF8F3", border: "none", borderRadius: 5, padding: "7px 10px", fontSize: 12.5, fontWeight: 600 }}
                >
                  Remove PIN
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={shellStyle}>
      <style>{fontImport}</style>
      <div className="no-print" style={{ width: 220, flexShrink: 0, borderRight: "1px solid #E4DFD3", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "0 8px 20px 8px" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#1B2A3D" }}>CTL Cloud</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#8A8574", letterSpacing: "0.05em" }}>invoicing, kept simple</div>
          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4DFD3" }}>
              <span style={{ fontSize: 12, color: "#6E6A5C" }}>Signed in: <strong style={{ color: "#1B2A3D" }}>{currentUser.name}</strong></span>
              <button
                onClick={() => { setUnlocked(false); setCurrentUser(null); setLoginUsername(""); setLoginPassword(""); }}
                style={{ background: "none", border: "none", color: "#8A8574", fontSize: 11.5, textDecoration: "underline", padding: 0 }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
        <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={15} />} label="Dashboard" onClick={() => setView("dashboard")} />
        <NavButton active={view === "reports"} icon={<BarChart3 size={15} />} label="Reports" onClick={() => setView("reports")} />
        <NavButton active={view === "invoices"} icon={<FileText size={15} />} label="Invoices" onClick={() => setView("invoices")} />
        <NavButton active={view === "quotations"} icon={<FileText size={15} />} label="Quotations" onClick={() => setView("quotations")} />
        <NavButton active={view === "receipts"} icon={<FileText size={15} />} label="Receipts" onClick={() => setView("receipts")} />
        <NavButton active={view === "purchase-orders"} icon={<Truck size={15} />} label="Purchase Orders" onClick={() => setView("purchase-orders")} />
        <NavButton active={view === "expenses"} icon={<Receipt size={15} />} label="Expenses" onClick={() => setView("expenses")} />
        <NavButton active={view === "schedule"} icon={<CalendarDays size={15} />} label="Schedule" onClick={() => setView("schedule")} />
        <NavButton active={view === "warranty"} icon={<ShieldCheck size={15} />} label="Warranty" onClick={() => setView("warranty")} />
        <NavButton active={view === "clients"} icon={<Users size={15} />} label="Clients" onClick={() => setView("clients")} />
        <NavButton active={view === "items"} icon={<Package size={15} />} label="Items" onClick={() => setView("items")} />
        <NavButton active={view === "settings"} icon={<SettingsIcon size={15} />} label="Business info" onClick={() => setView("settings")} />
        <NavButton active={view === "trash"} icon={<Trash2 size={15} />} label={`Trash${trash.length ? ` (${trash.length})` : ""}`} onClick={() => setView("trash")} />
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#8A8574", padding: "12px 8px", borderTop: "1px solid #E4DFD3", marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Outstanding</span><span style={{ color: "#B5482F", fontWeight: 600 }}>{money(totalsSummary.outstanding)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Paid</span><span style={{ color: "#3D6B5C", fontWeight: 600 }}>{money(totalsSummary.paid)}</span>
          </div>
        </div>
      </div>

      <div className="app-main" style={{ flex: 1, overflow: "auto", padding: "28px 36px" }}>
        {view === "dashboard" && (
          <Dashboard
            invoices={invoices}
            expenses={expenses}
            items={items}
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNewInvoice={() => createDoc("invoice")}
            onNewQuotation={() => createDoc("quotation")}
            onNewReceipt={() => createDoc("receipt")}
          />
        )}
        {view === "reports" && <ReportsPanel invoices={invoices} expenses={expenses} settings={settings} />}
        {view === "invoices" && (
          <InvoiceList
            title="Invoices"
            docTypeFilter="invoice"
            invoices={invoices}
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNew={() => createDoc("invoice")}
            newLabel="New invoice"
            onDelete={deleteInvoice}
          />
        )}
        {view === "quotations" && (
          <InvoiceList
            title="Quotations"
            docTypeFilter="quotation"
            invoices={invoices}
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNew={() => createDoc("quotation")}
            newLabel="New quotation"
            onDelete={deleteInvoice}
          />
        )}
        {view === "receipts" && (
          <ReceiptList
            invoices={invoices}
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNew={() => createDoc("receipt")}
            onDelete={deleteInvoice}
          />
        )}
        {view === "purchase-orders" && (
          <InvoiceList
            title="Purchase Orders"
            docTypeFilter="po"
            invoices={invoices}
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNew={() => createDoc("po")}
            newLabel="New purchase order"
            onDelete={deleteInvoice}
          />
        )}
        {view === "clients" && <ClientsPanel clients={clients} updateClients={updateClients} showToast={showToast} onTrash={(label, record) => moveToTrash("client", label, record)} />}
        {view === "expenses" && (
          <ExpensesPanel
            expenses={expenses}
            updateExpenses={updateExpenses}
            showToast={showToast}
            purchaseOrders={invoices.filter((i) => i.docType === "po")}
            onLinkPO={(poId) => handleStatusChange(poId, "paid")}
            onTrash={(label, record) => moveToTrash("expense", label, record)}
          />
        )}
        {view === "schedule" && (
          <SchedulePanel schedule={schedule} updateSchedule={updateSchedule} clients={clients} showToast={showToast} onTrash={(label, record) => moveToTrash("schedule", label, record)} />
        )}
        {view === "warranty" && <WarrantyPanel invoices={invoices} items={items} />}
        {view === "items" && <ItemsPanel items={items} updateItems={updateItems} showToast={showToast} onTrash={(label, record) => moveToTrash("item", label, record)} />}
        {view === "trash" && <TrashPanel trash={trash} onRestore={restoreFromTrash} onDeleteForever={deleteForever} onEmptyTrash={emptyTrash} />}
        {view === "settings" && (
          <SettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            showToast={showToast}
            allData={{ clients, invoices, items, expenses, schedule, settings }}
            onImportAll={(data) => {
              if (data.clients) updateClients(data.clients);
              if (data.invoices) updateInvoices(data.invoices);
              if (data.items) updateItems(data.items);
              if (data.expenses) updateExpenses(data.expenses);
              if (data.schedule) updateSchedule(data.schedule);
              if (data.settings) updateSettings({ ...DEFAULT_SETTINGS, ...data.settings });
              showToast("Backup restored");
            }}
          />
        )}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptEditor receipt={activeInvoice} clients={clients} onChange={(patch) => patchInvoice(activeInvoice.id, patch)} onDone={() => setView("invoice-view")} onBack={() => setView("receipts")} />
        )}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceEditor invoice={activeInvoice} clients={clients} items={items} onChange={(patch) => patchInvoice(activeInvoice.id, patch)} onDone={() => setView("invoice-view")} onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : activeInvoice.docType === "po" ? "purchase-orders" : "invoices")} />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptView receipt={activeInvoice} settings={settings} onBack={() => setView("receipts")} onEdit={() => setView("invoice-edit")} onDelete={() => deleteInvoice(activeInvoice.id)} />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceView invoice={activeInvoice} settings={settings} onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : activeInvoice.docType === "po" ? "purchase-orders" : "invoices")} onEdit={() => setView("invoice-edit")} onStatus={(status) => handleStatusChange(activeInvoice.id, status)} onDelete={() => deleteInvoice(activeInvoice.id)} onConvert={() => convertToInvoice(activeInvoice.id)} onConvertToReceipt={() => convertToReceipt(activeInvoice.id)} onAddPayment={(payment) => addPayment(activeInvoice.id, payment)} onRemovePayment={(paymentId) => removePayment(activeInvoice.id, paymentId)} />
        )}
      </div>

      {toast && (
        <div className="no-print" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1B2A3D", color: "#FAF8F3", padding: "9px 18px", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const shellStyle = { display: "flex", height: "100vh", width: "100%", background: "#FAF8F3", color: "#1B2A3D", fontFamily: "'Source Serif 4', Georgia, serif" };

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Serif+4:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+Khmer:wght@400;500;600&display=swap');
* { box-sizing: border-box; }
button { font-family: inherit; cursor: pointer; }
::selection { background: #D9CBB8; }
input::placeholder, textarea::placeholder { color: #B7AF98; font-style: italic; opacity: 1; }
@media print {
  .no-print { display: none !important; }
  html, body { height: auto !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .app-shell {
    display: block !important;
    height: auto !important;
    width: auto !important;
    overflow: visible !important;
  }
  .app-main {
    overflow: visible !important;
    height: auto !important;
    padding: 0 !important;
  }
  .print-sheet {
    max-width: none !important;
    width: 100% !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .print-sheet svg { display: none !important; }
  .print-sheet [data-icon-wrap] { display: none !important; }
  @page { size: A4; margin: 14mm; }
}
`;

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 5, border: "none", background: active ? "#EDEAE2" : "transparent", color: active ? "#1B2A3D" : "#6E6A5C", fontSize: 13.5, fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: active ? 600 : 400, textAlign: "left" }}>
      {icon}{label}
    </button>
  );
}

// ---------- Dashboard ----------
function Dashboard({ invoices, expenses, items, onOpen, onNewInvoice, onNewQuotation, onNewReceipt }) {
  const data = useMemo(() => {
    const invOnly = invoices.filter((i) => (i.docType || "invoice") === "invoice");
    const quotesOnly = invoices.filter((i) => i.docType === "quotation");
    const receiptsOnly = invoices.filter((i) => i.docType === "receipt");

    let totalPaid = 0, totalOutstanding = 0, totalOverdue = 0;
    const statusAmounts = {};
    const byClient = {};
    invOnly.forEach((inv) => {
      const { total } = calcTotals(inv);
      const st = effectiveStatus(inv);
      if (st === "paid") totalPaid += total;
      else {
        totalOutstanding += total;
        if (st === "overdue") totalOverdue += total;
      }
      statusAmounts[st] = (statusAmounts[st] || 0) + total;
      const name = inv.clientName || "—";
      byClient[name] = (byClient[name] || 0) + total;
    });

    let quoteOpenValue = 0, quoteAccepted = 0, quoteDeclined = 0;
    quotesOnly.forEach((q) => {
      const { total } = calcTotals(q);
      if (q.status === "accepted") quoteAccepted++;
      else if (q.status === "declined") quoteDeclined++;
      else quoteOpenValue += total;
    });
    const decided = quoteAccepted + quoteDeclined;
    const acceptRate = decided ? Math.round((quoteAccepted / decided) * 100) : null;

    const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0);
    const expensesByCategory = {};
    expenses.forEach((e) => { expensesByCategory[e.category || "Other"] = (expensesByCategory[e.category || "Other"] || 0) + num(e.amount); });

    const months = lastNMonthKeys(6);
    const monthData = months.map((key) => {
      let invoiced = 0, collected = 0, spent = 0;
      invOnly.forEach((inv) => {
        if (monthKey(inv.issueDate) === key) {
          const { total } = calcTotals(inv);
          invoiced += total;
          if (inv.status === "paid") collected += total;
        }
      });
      expenses.forEach((e) => { if (monthKey(e.date) === key) spent += num(e.amount); });
      return { month: monthLabel(key), Invoiced: +invoiced.toFixed(2), Collected: +collected.toFixed(2), Expenses: +spent.toFixed(2) };
    });

    const pieData = Object.entries(statusAmounts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: STATUS[key]?.label || key, value: +value.toFixed(2), color: STATUS[key]?.color || "#999" }));

    const expensePieData = Object.entries(expensesByCategory)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: key, value: +value.toFixed(2), color: EXPENSE_CATEGORY_COLORS[key]?.color || "#999" }));

    const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recent = [...invoices]
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""))
      .slice(0, 6);

    const totalReceipted = receiptsOnly.reduce((s, r) => s + num(r.amountReceived), 0);
    const netProfit = totalPaid - totalExpenses;
    const lowStockCount = items.filter((it) => num(it.stock) <= num(it.lowStockThreshold ?? 5)).length;

    return { totalPaid, totalOutstanding, totalOverdue, quoteOpenValue, acceptRate, quoteCount: quotesOnly.length, monthData, pieData, expensePieData, topClients, recent, totalReceipted, receiptCount: receiptsOnly.length, totalExpenses, netProfit, lowStockCount };
  }, [invoices, expenses, items]);

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Dashboard</h1>
      </div>

      {invoices.length === 0 && expenses.length === 0 ? (
        <EmptyState title="Nothing to report yet" body="Create an invoice or quotation from the sidebar and your numbers will show up here." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 12 }}>
            <KpiCard icon={<TrendingUp size={15} />} label="Paid (all time)" value={money(data.totalPaid)} tone="#3D6B5C" />
            <KpiCard icon={<FileText size={15} />} label="Outstanding" value={money(data.totalOutstanding)} tone="#1B2A3D" />
            <KpiCard icon={<AlertTriangle size={15} />} label="Overdue" value={money(data.totalOverdue)} tone="#B5482F" />
            <KpiCard
              icon={<Percent size={15} />}
              label="Quotation accept rate"
              value={data.acceptRate === null ? "—" : `${data.acceptRate}%`}
              sub={`${data.quoteCount} total · ${money(data.quoteOpenValue)} open`}
              tone="#8A6D3D"
            />
            <KpiCard icon={<FileText size={15} />} label="Receipted" value={money(data.totalReceipted)} sub={`${data.receiptCount} receipt${data.receiptCount === 1 ? "" : "s"}`} tone="#1B2A3D" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
            <KpiCard icon={<Receipt size={15} />} label="Total expenses" value={money(data.totalExpenses)} sub={`${expenses.length} expense${expenses.length === 1 ? "" : "s"} logged`} tone="#B5482F" />
            <KpiCard icon={<TrendingUp size={15} />} label="Net profit (paid − expenses)" value={money(data.netProfit)} tone={data.netProfit < 0 ? "#B5482F" : "#3D6B5C"} />
            <KpiCard icon={<AlertTriangle size={15} />} label="Low stock items" value={data.lowStockCount} sub={data.lowStockCount > 0 ? "Check Items page" : "All good"} tone={data.lowStockCount > 0 ? "#B5482F" : "#3D6B5C"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
              <div style={panelTitle}>Revenue &amp; expenses, last 6 months</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDEAE2" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8A8574" }} axisLine={{ stroke: "#DAD5C6" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#8A8574" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", border: "1px solid #E4DFD3", borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Invoiced" fill="#C9C3B0" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Collected" fill="#3D6B5C" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#B5482F" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
              <div style={panelTitle}>Invoice status mix</div>
              {data.pieData.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A8574", padding: "20px 0" }}>No invoices yet.</div>
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.pieData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                        {data.pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", border: "1px solid #E4DFD3", borderRadius: 6 }} />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
              <div style={panelTitle}>Top clients</div>
              {data.topClients.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A8574" }}>No invoiced clients yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                  {data.topClients.map(([name, amt], i) => {
                    const max = data.topClients[0][1] || 1;
                    return (
                      <div key={name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <span>{name}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(amt)}</span>
                        </div>
                        <div style={{ height: 6, background: "#EDEAE2", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max((amt / max) * 100, 4)}%`, background: "#3D6B5C" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ ...panelTitle, padding: "14px 16px 8px 16px" }}>Recent documents</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {data.recent.map((inv) => {
                    const isReceipt = inv.docType === "receipt";
                    const isQuote = inv.docType === "quotation";
                    const isPO = inv.docType === "po";
                    const amount = isReceipt ? num(inv.amountReceived) : calcTotals(inv).total;
                    const status = isReceipt ? null : effectiveStatus(inv);
                    const typeLabel = isReceipt ? "RCPT" : isQuote ? "QUOTE" : isPO ? "PO" : "INV";
                    const typeColor = isReceipt ? "#1B2A3D" : isQuote ? "#8A6D3D" : isPO ? "#6E6A5C" : "#3D6B5C";
                    const partyName = inv.clientName || "—";
                    return (
                      <tr key={inv.id} onClick={() => onOpen(inv.id)} style={{ borderTop: "1px solid #E4DFD3", cursor: "pointer" }}>
                        <td style={{ padding: "9px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: typeColor, fontWeight: 600, whiteSpace: "nowrap" }}>{typeLabel}</td>
                        <td style={{ padding: "9px 8px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{inv.quoteNumber}</td>
                        <td style={{ padding: "9px 8px" }}>{partyName}</td>
                        <td style={{ padding: "9px 8px", fontFamily: "'IBM Plex Mono', monospace", textAlign: "right" }}>{money(amount)}</td>
                        <td style={{ padding: "9px 16px", textAlign: "right" }}>{status ? <Badge status={status} /> : <span style={{ fontSize: 11, color: "#8A8574" }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone }) {
  return (
    <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: "14px 16px", background: "#FFFDF9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: tone, marginBottom: 8 }}>
        {icon}
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8A8574" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: "#1B2A3D" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#8A8574", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const panelTitle = { fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: "#1B2A3D", marginBottom: 10 };

// ---------- Reports ----------
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}
function firstOfMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function showInPageMessage(msg) {
  try {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1B2A3D;color:#FAF8F3;padding:12px 18px;border-radius:6px;font-family:sans-serif;font-size:13px;max-width:88vw;text-align:center;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,0.25);";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  } catch (e) {
    // Last resort only if DOM manipulation itself is unavailable
    try { alert(msg); } catch (e2) {}
  }
}

function handlePrintSafe() {
  try {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    } else {
      showInPageMessage("Printing isn't available in this view. Try opening this app in a full browser tab (menu → open in browser), then print from there.");
    }
  } catch (e) {
    showInPageMessage("Couldn't open the print dialog here. Try opening this app in a full browser tab (menu → open in browser), then print from there.");
  }
}

function shareViaWhatsApp(text, phone) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
}
function shareViaTelegram(text) {
  window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, "_blank");
}

function ReportsPanel({ invoices, expenses, settings }) {
  const now = new Date();
  const [fromDate, setFromDate] = useState(firstOfMonth(now));
  const [toDate, setToDate] = useState(todayISO());

  function setPreset(preset) {
    const n = new Date();
    if (preset === "thisMonth") {
      setFromDate(firstOfMonth(n));
      setToDate(todayISO());
    } else if (preset === "lastMonth") {
      const last = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const lastEnd = new Date(n.getFullYear(), n.getMonth(), 0);
      setFromDate(firstOfMonth(last));
      setToDate(lastEnd.toISOString().slice(0, 10));
    } else if (preset === "thisYear") {
      setFromDate(`${n.getFullYear()}-01-01`);
      setToDate(todayISO());
    } else if (preset === "allTime") {
      setFromDate("");
      setToDate("");
    }
  }

  const data = useMemo(() => {
    const inv = invoices.filter((i) => (i.docType || "invoice") === "invoice" && inRange(i.issueDate, fromDate, toDate));
    const quotes = invoices.filter((i) => i.docType === "quotation" && inRange(i.issueDate, fromDate, toDate));
    const receipts = invoices.filter((i) => i.docType === "receipt" && inRange(i.issueDate, fromDate, toDate));
    const pos = invoices.filter((i) => i.docType === "po" && inRange(i.issueDate, fromDate, toDate));
    const exp = expenses.filter((e) => inRange(e.date, fromDate, toDate));

    let invoiced = 0, collected = 0, outstanding = 0;
    inv.forEach((i) => {
      const { total } = calcTotals(i);
      invoiced += total;
      if (i.status === "paid") collected += total;
      else outstanding += total;
    });

    let quoted = 0, accepted = 0;
    quotes.forEach((q) => {
      const { total } = calcTotals(q);
      quoted += total;
      if (q.status === "accepted") accepted += total;
    });

    const receiptedTotal = receipts.reduce((s, r) => s + num(r.amountReceived), 0);

    let poValue = 0, poPaid = 0;
    pos.forEach((p) => {
      const { total } = calcTotals(p);
      poValue += total;
      if (p.status === "paid") poPaid += total;
    });

    const expenseTotal = exp.reduce((s, e) => s + num(e.amount), 0);
    const expenseByCategory = {};
    exp.forEach((e) => { expenseByCategory[e.category || "Other"] = (expenseByCategory[e.category || "Other"] || 0) + num(e.amount); });

    const netProfit = collected - expenseTotal - poPaid;

    const transactions = [
      ...inv.map((i) => ({ id: i.id, date: i.issueDate, type: "Invoice", number: i.quoteNumber, party: i.clientName || "—", amount: calcTotals(i).total, status: effectiveStatus(i) })),
      ...quotes.map((q) => ({ id: q.id, date: q.issueDate, type: "Quotation", number: q.quoteNumber, party: q.clientName || "—", amount: calcTotals(q).total, status: q.status })),
      ...receipts.map((r) => ({ id: r.id, date: r.issueDate, type: "Receipt", number: r.quoteNumber, party: r.clientName || "—", amount: num(r.amountReceived), status: "" })),
      ...pos.map((p) => ({ id: p.id, date: p.issueDate, type: "Purchase Order", number: p.quoteNumber, party: p.clientName || "—", amount: calcTotals(p).total, status: p.status })),
      ...exp.map((e) => ({ id: e.id, date: e.date, type: "Expense", number: e.reference || "—", party: e.payee || e.category || "—", amount: -num(e.amount), status: e.category })),
    ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return { invoiced, collected, outstanding, quoted, accepted, receiptedTotal, poValue, poPaid, expenseTotal, expenseByCategory, netProfit, transactions };
  }, [invoices, expenses, fromDate, toDate]);

  const arAging = useMemo(() => {
    const today = todayISO();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const rows = [];
    invoices.filter((i) => (i.docType || "invoice") === "invoice" && i.status !== "draft").forEach((i) => {
      const { balanceDue } = calcTotals(i);
      if (balanceDue <= 0.005) return;
      const due = i.dueDate || i.issueDate;
      const daysOverdue = due ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
      let bucket;
      if (daysOverdue <= 0) { buckets.current += balanceDue; bucket = "Current"; }
      else if (daysOverdue <= 30) { buckets.d30 += balanceDue; bucket = "1-30 days"; }
      else if (daysOverdue <= 60) { buckets.d60 += balanceDue; bucket = "31-60 days"; }
      else if (daysOverdue <= 90) { buckets.d90 += balanceDue; bucket = "61-90 days"; }
      else { buckets.d90plus += balanceDue; bucket = "90+ days"; }
      rows.push({ id: i.id, client: i.clientName || "—", number: i.quoteNumber, dueDate: due, balanceDue, daysOverdue: Math.max(daysOverdue, 0), bucket });
    });
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus;
    return { buckets, rows, total };
  }, [invoices]);

  function exportCsv() {
    const rows = [["Date", "Type", "Number", "Party", "Amount", "Status"]];
    data.transactions.forEach((t) => rows.push([t.date, t.type, t.number, t.party, t.amount.toFixed(2), t.status || ""]));
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${fromDate || "all"}_to_${toDate || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rangeLabel = fromDate && toDate ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}` : "All time";

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Reports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn icon={<Download size={13} />} label="Export CSV" onClick={exportCsv} />
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={handlePrintSafe} />
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ width: 160 }}><Field label="From"><TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field></div>
        <div style={{ width: 160 }}><Field label="To"><TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field></div>
        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {[["thisMonth", "This month"], ["lastMonth", "Last month"], ["thisYear", "This year"], ["allTime", "All time"]].map(([key, label]) => (
            <button key={key} onClick={() => setPreset(key)} style={{ background: "none", border: "1px solid #DAD5C6", color: "#6E6A5C", borderRadius: 5, padding: "8px 12px", fontSize: 12.5, fontWeight: 600 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="print-sheet" style={{ background: "#FFFDF9", border: "1px solid #E4DFD3", borderRadius: 10, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, borderBottom: "2px solid #1B2A3D", paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700 }}>{settings.businessName}</div>
            <div style={{ fontSize: 12, color: "#8A8574" }}>Financial report</div>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "#6E6A5C" }}>{rangeLabel}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
          <KpiCard icon={<FileText size={15} />} label="Invoiced" value={money(data.invoiced)} tone="#1B2A3D" />
          <KpiCard icon={<TrendingUp size={15} />} label="Collected" value={money(data.collected)} tone="#3D6B5C" />
          <KpiCard icon={<AlertTriangle size={15} />} label="Outstanding" value={money(data.outstanding)} tone="#B5482F" />
          <KpiCard icon={<Percent size={15} />} label="Quoted (accepted)" value={money(data.quoted)} sub={money(data.accepted) + " accepted"} tone="#8A6D3D" />
          <KpiCard icon={<Receipt size={15} />} label="Receipted" value={money(data.receiptedTotal)} tone="#1B2A3D" />
          <KpiCard icon={<Truck size={15} />} label="PO value (paid)" value={money(data.poValue)} sub={money(data.poPaid) + " paid"} tone="#6E6A5C" />
          <KpiCard icon={<Receipt size={15} />} label="Expenses" value={money(data.expenseTotal)} tone="#B5482F" />
          <KpiCard icon={<TrendingUp size={15} />} label="Net profit" value={money(data.netProfit)} tone={data.netProfit < 0 ? "#B5482F" : "#3D6B5C"} />
        </div>

        {Object.keys(data.expenseByCategory).length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Expenses by category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(data.expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                const max = Math.max(...Object.values(data.expenseByCategory));
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                      <span>{cat}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(amt)}</span>
                    </div>
                    <div style={{ height: 6, background: "#EDEAE2", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max((amt / max) * 100, 4)}%`, background: "#B5482F" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {arAging.total > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Accounts receivable aging</div>
            <div style={{ fontSize: 11.5, color: "#8A8574", marginBottom: 10 }}>All outstanding invoices as of today, regardless of the date range above.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
              {[
                ["Current", arAging.buckets.current, "#3D6B5C"],
                ["1-30 days", arAging.buckets.d30, "#8A6D3D"],
                ["31-60 days", arAging.buckets.d60, "#B5482F"],
                ["61-90 days", arAging.buckets.d90, "#B5482F"],
                ["90+ days", arAging.buckets.d90plus, "#B5482F"],
              ].map(([label, amt, color]) => (
                <div key={label} style={{ border: "1px solid #E4DFD3", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "#8A8574", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color }}>{money(amt)}</div>
                </div>
              ))}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #DAD5C6", textAlign: "left" }}>
                  {["Client", "Invoice #", "Due", "Days overdue", "Balance", "Bucket"].map((h) => (
                    <th key={h} style={{ padding: "5px 8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8A8574", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {arAging.rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #EDEAE2" }}>
                    <td style={{ padding: "5px 8px" }}>{r.client}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "'IBM Plex Mono', monospace" }}>{r.number}</td>
                    <td style={{ padding: "5px 8px", color: "#6E6A5C" }}>{fmtDate(r.dueDate)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.daysOverdue}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{money(r.balanceDue)}</td>
                    <td style={{ padding: "5px 8px", color: "#8A8574" }}>{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Transactions ({data.transactions.length})</div>
        {data.transactions.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A8574" }}>No activity in this range.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #1B2A3D", textAlign: "left" }}>
                {["Date", "Type", "Number", "Party", "Amount"].map((h) => (
                  <th key={h} style={{ padding: "6px 8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A8574" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.type + t.id} style={{ borderBottom: "1px solid #EDEAE2" }}>
                  <td style={{ padding: "6px 8px", color: "#6E6A5C" }}>{fmtDate(t.date)}</td>
                  <td style={{ padding: "6px 8px" }}>{t.type}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "'IBM Plex Mono', monospace" }}>{t.number}</td>
                  <td style={{ padding: "6px 8px" }}>{t.party}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", color: t.amount < 0 ? "#B5482F" : "#1B2A3D" }}>{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------- Warranty ----------
function addMonths(iso, months) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + Number(months || 0));
  return d.toISOString().slice(0, 10);
}

function advanceByFrequency(iso, frequency) {
  const d = new Date(iso + "T00:00:00");
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d.toISOString().slice(0, 10);
}

// ---------- Trash ----------
const TRASH_TYPE_LABELS = {
  client: "Client",
  item: "Item",
  expense: "Expense",
  schedule: "Schedule",
  invoice: "Invoice",
  quotation: "Quotation",
  receipt: "Receipt",
  po: "Purchase Order",
};

function TrashPanel({ trash, onRestore, onDeleteForever, onEmptyTrash }) {
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const sorted = [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Trash</h1>
        {trash.length > 0 && !confirmingEmpty && (
          <button onClick={() => setConfirmingEmpty(true)} style={{ background: "none", border: "1px solid #DAD5C6", color: "#B5482F", borderRadius: 5, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
            Empty trash
          </button>
        )}
        {confirmingEmpty && (
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "#8A8574", alignSelf: "center" }}>Permanently delete everything?</span>
            <button onClick={() => setConfirmingEmpty(false)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "6px 12px", fontSize: 12.5 }}>Cancel</button>
            <button onClick={() => { onEmptyTrash(); setConfirmingEmpty(false); }} style={{ background: "#B5482F", color: "#FAF8F3", border: "none", borderRadius: 5, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>Yes, empty it</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "#8A8574", marginBottom: 18 }}>Deleted items stay here for 30 days before being cleared automatically.</div>

      {sorted.length === 0 ? (
        <EmptyState title="Trash is empty" body="Anything you delete — clients, items, invoices, expenses, schedule entries — shows up here for 30 days." />
      ) : (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                {["Type", "Item", "Deleted", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, idx) => (
                <tr key={t.id} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6E6A5C", background: "#EDEAE2", padding: "3px 8px", borderRadius: 3, fontWeight: 600 }}>
                      {TRASH_TYPE_LABELS[t.type] || t.type}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>{t.label}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{fmtDate(t.deletedAt.slice(0, 10))}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => onRestore(t.id)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 10px", fontSize: 12 }}>
                        <RotateCcw size={12} /> Restore
                      </button>
                      <button onClick={() => onDeleteForever(t.id)} style={{ background: "none", border: "none", color: "#B5482F", padding: 5 }}><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WarrantyPanel({ invoices, items }) {
  const [filter, setFilter] = useState("all"); // all | active | expired
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const invOnly = invoices.filter((i) => (i.docType || "invoice") === "invoice" && i.status !== "draft");
    const out = [];
    invOnly.forEach((inv) => {
      (inv.rows || []).filter((r) => r.kind === "item").forEach((r) => {
        const match = items.find((it) => {
          if (r.code && it.code) return it.code.trim().toLowerCase() === r.code.trim().toLowerCase();
          return it.desc.trim().toLowerCase() === (r.desc || "").trim().toLowerCase();
        });
        const months = num(match?.warrantyMonths);
        if (!match || months <= 0) return;
        const expiry = addMonths(inv.issueDate, months);
        out.push({
          id: `${inv.id}-${r.id}`,
          client: inv.clientName || "—",
          phone: inv.clientPhone || "",
          item: r.desc,
          code: r.code,
          invoiceNumber: inv.quoteNumber,
          issueDate: inv.issueDate,
          months,
          expiry,
          active: expiry >= todayISO(),
        });
      });
    });
    return out.sort((a, b) => a.expiry.localeCompare(b.expiry));
  }, [invoices, items]);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter === "active" && !r.active) return false;
    if (filter === "expired" && r.active) return false;
    if (!q) return true;
    return r.client.toLowerCase().includes(q) || r.item.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q);
  });

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 6px 0" }}>Warranty</h1>
      <div style={{ fontSize: 12.5, color: "#8A8574", marginBottom: 18 }}>Tracked automatically from invoiced items that have a warranty period set in your Items catalog.</div>

      <div style={{ marginBottom: 12, maxWidth: 360 }}>
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by client, item, code, or invoice #…" />
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["all", `All (${rows.length})`], ["active", `Active (${activeCount})`], ["expired", `Expired (${rows.length - activeCount})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{ background: filter === key ? "#1B2A3D" : "transparent", color: filter === key ? "#FAF8F3" : "#6E6A5C", border: "none", borderRadius: 5, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={rows.length === 0 ? "No warranties tracked yet" : "No matches"} body={rows.length === 0 ? "Set a warranty period (months) on items in your catalog, and it'll show up here once invoiced." : "Try a different search or filter."} />
      ) : (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                {["Client", "Item", "Invoice #", "Issued", "Warranty", "Expires", "Status"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={r.id} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                  <td style={{ padding: "11px 14px" }}>{r.client}</td>
                  <td style={{ padding: "11px 14px" }}>{r.item}{r.code ? ` (${r.code})` : ""}</td>
                  <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{r.invoiceNumber}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{fmtDate(r.issueDate)}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{r.months} mo</td>
                  <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{fmtDate(r.expiry)}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: r.active ? "#3D6B5C" : "#B5482F", background: r.active ? "#E3EDE8" : "#F5E4DE", padding: "3px 8px", borderRadius: 3, fontWeight: 600 }}>
                      {r.active ? "Active" : "Expired"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Invoice / Quotation List ----------
function InvoiceList({ title, docTypeFilter, invoices, onOpen, onNew, newLabel, onDelete }) {
  const [search, setSearch] = useState("");
  const byType = invoices.filter((inv) => (inv.docType || "invoice") === docTypeFilter);
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? byType
    : byType.filter((inv) => {
        if ((inv.quoteNumber || "").toLowerCase().includes(q)) return true;
        if ((inv.clientName || "").toLowerCase().includes(q)) return true;
        return (inv.rows || []).some((r) => (r.desc || "").toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q));
      });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>{title}</h1>
        <button onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
          <Plus size={15} /> {newLabel}
        </button>
      </div>

      {byType.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={docTypeFilter === "po" ? "Search by PO #, supplier, code, or item…" : "Search by number, client, code, or item…"}
            style={{ maxWidth: 340 }}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={q ? "No matches" : docTypeFilter === "quotation" ? "No quotations yet" : docTypeFilter === "po" ? "No purchase orders yet" : "No invoices yet"}
          body={q ? "Try a different search term." : docTypeFilter === "quotation" ? "Create a quotation to send an estimate before billing." : docTypeFilter === "po" ? "Create a purchase order to request materials or stock from a supplier." : "Create your first invoice to start tracking what's owed."}
          action={q ? undefined : { label: newLabel, onClick: onNew }}
        />
      ) : (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                {[docTypeFilter === "quotation" ? "Quote #" : docTypeFilter === "po" ? "PO #" : "Invoice #", docTypeFilter === "po" ? "Supplier" : "Client", "Issued", "Amount", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, idx) => {
                const { total } = calcTotals(inv);
                const status = effectiveStatus(inv);
                return (
                  <tr key={inv.id} onClick={() => onOpen(inv.id)} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                    <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{inv.quoteNumber}</td>
                    <td style={{ padding: "11px 14px" }}>{inv.clientName || "—"}</td>
                    <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{fmtDate(inv.issueDate)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(total)}</td>
                    <td style={{ padding: "11px 14px" }}><Badge status={status} /></td>
                    <td style={{ padding: "11px 14px", textAlign: "right" }}>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(inv.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 4 }} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div style={{ border: "1px dashed #DAD5C6", borderRadius: 8, padding: "48px 24px", textAlign: "center", color: "#8A8574" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1B2A3D", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, marginBottom: 18 }}>{body}</div>
      {action && <button onClick={action.onClick} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>{action.label}</button>}
    </div>
  );
}

// ---------- Settings ----------
function SettingsPanel({ settings, updateSettings, showToast, allData, onImportAll }) {
  const [form, setForm] = useState(settings);
  const [logoError, setLogoError] = useState("");
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", username: "", password: "" });
  const [userError, setUserError] = useState("");
  const fileInputRef = useRef(null);
  useEffect(() => setForm(settings), [settings]);
  function save() {
    updateSettings(form);
    showToast("Business info saved");
  }
  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError("");
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setLogoError("Image is too large — please use one under ~3.5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoDataUrl: reader.result }));
    reader.onerror = () => setLogoError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  }
  function exportBackup() {
    const payload = { exportedAt: new Date().toISOString(), ...allData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ctl-cloud-backup_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  }
  function addUser() {
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      setUserError("Fill in name, username, and password.");
      return;
    }
    if (form.users.some((u) => u.username.trim().toLowerCase() === newUser.username.trim().toLowerCase())) {
      setUserError("That username is already taken.");
      return;
    }
    const nextUsers = [...form.users, { id: uid(), ...newUser }];
    setForm({ ...form, users: nextUsers });
    updateSettings({ ...form, users: nextUsers });
    setNewUser({ name: "", username: "", password: "" });
    setUserError("");
    showToast("User added");
  }
  function removeUser(id) {
    const nextUsers = form.users.filter((u) => u.id !== id);
    setForm({ ...form, users: nextUsers });
    updateSettings({ ...form, users: nextUsers });
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        setPendingImport(data);
      } catch (err) {
        setImportError("Couldn't read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
  }
  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Business info</h1>
      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9", marginBottom: 18 }}>
        <Field label="Logo">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, border: "1px solid #DAD5C6", background: "#FFFDF9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {form.logoDataUrl ? (
                <img src={form.logoDataUrl} alt="Logo preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8A8574" }}>none</span>
              )}
            </div>
            <div>
              <label style={{ display: "inline-block", background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Upload image
                <input type="file" accept="image/*" onChange={handleLogoFile} style={{ display: "none" }} />
              </label>
              {form.logoDataUrl && (
                <button onClick={() => setForm({ ...form, logoDataUrl: "" })} style={{ marginLeft: 8, background: "none", border: "none", color: "#B5482F", fontSize: 12.5 }}>Remove</button>
              )}
              {logoError && <div style={{ color: "#B5482F", fontSize: 11.5, marginTop: 5 }}>{logoError}</div>}
            </div>
          </div>
        </Field>
        <Field label="Business name"><TextInput value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
        <Field label="Tagline (optional)"><TextInput value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Blinds & Curtain Solutions" /></Field>
        <Field label="Address"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Seller signature name"><TextInput value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} placeholder="Shown on the invoice signature line" /></Field>
        <Field label="Default terms & conditions">
          <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </Field>
        <Field label="Footer note"><TextInput value={form.thanksNote} onChange={(e) => setForm({ ...form, thanksNote: e.target.value })} /></Field>
        <button onClick={save} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Save</button>
      </div>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Currency</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="USD → KHR rate"><TextInput type="number" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} /></Field></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8574", marginBottom: 5 }}>Show KHR on documents</div>
            <button
              onClick={() => setForm({ ...form, showKHR: !form.showKHR })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px solid #DAD5C6", borderRadius: 4, padding: "8px 10px", fontSize: 13.5, width: "100%" }}
            >
              <span style={{ width: 32, height: 18, borderRadius: 9, background: form.showKHR ? "#3D6B5C" : "#DAD5C6", position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 2, left: form.showKHR ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#FFFDF9", transition: "left 0.15s" }} />
              </span>
              {form.showKHR ? "On" : "Off"}
            </button>
          </div>
        </div>
        <button onClick={save} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>Save</button>
      </div>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>KHQR payment</div>
        <div style={{ fontSize: 12.5, color: "#8A8574", marginBottom: 12 }}>Paste the payment string from your bank/Bakong KHQR (not a screenshot — the raw text/code your bank app can export). A scannable QR will be shown on invoices so clients can pay you directly.</div>
        <Field label="KHQR payload"><textarea rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }} value={form.khqrPayload} onChange={(e) => setForm({ ...form, khqrPayload: e.target.value })} placeholder="00020101021129..." /></Field>
        <button onClick={save} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Save</button>
      </div>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>App lock</div>
        <div style={{ fontSize: 12.5, color: "#8A8574", marginBottom: 14 }}>Require unlocking this app each time it's opened. This is a basic deterrent, not real security — anyone with access to your browser's data could still bypass it.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["none", "No lock"], ["pin", "PIN"], ["users", "User logins"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setForm({ ...form, authMode: key }); updateSettings({ ...form, authMode: key }); }}
              style={{
                background: (form.authMode || "none") === key ? "#1B2A3D" : "transparent",
                color: (form.authMode || "none") === key ? "#FAF8F3" : "#6E6A5C",
                border: "1px solid #DAD5C6",
                borderRadius: 5,
                padding: "7px 14px",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {form.authMode === "pin" && (
          <>
            <Field label="PIN"><TextInput type="password" inputMode="numeric" value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} placeholder="e.g. 1234" /></Field>
            <button onClick={save} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Save</button>
          </>
        )}

        {form.authMode === "users" && (
          <>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8574", marginBottom: 8 }}>Accounts</div>
            {form.users.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {form.users.map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #E4DFD3", borderRadius: 6, padding: "8px 12px" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: "#8A8574" }}>@{u.username}</div>
                    </div>
                    <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", color: "#B5482F" }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <TextInput value={newUser.name} onChange={(e) => { setNewUser({ ...newUser, name: e.target.value }); setUserError(""); }} placeholder="Name" />
              <TextInput value={newUser.username} onChange={(e) => { setNewUser({ ...newUser, username: e.target.value }); setUserError(""); }} placeholder="Username" />
              <TextInput type="password" value={newUser.password} onChange={(e) => { setNewUser({ ...newUser, password: e.target.value }); setUserError(""); }} placeholder="Password" />
            </div>
            {userError && <div style={{ color: "#B5482F", fontSize: 12, marginTop: 6 }}>{userError}</div>}
            <button onClick={addUser} style={{ marginTop: 10, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Add user</button>
            {form.users.length === 0 && <div style={{ fontSize: 12, color: "#8A8574", marginTop: 8 }}>Add at least one user above for the login screen to appear.</div>}
          </>
        )}
      </div>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Backup &amp; restore</div>
        <div style={{ fontSize: 12.5, color: "#8A8574", marginBottom: 14 }}>Download everything — clients, invoices, quotations, receipts, purchase orders, items, expenses, and schedule — as one file. Keep it somewhere safe.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={exportBackup} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 14px", borderRadius: 5, fontSize: 13, fontWeight: 600 }}>
            <Download size={14} /> Export backup
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", padding: "8px 14px", borderRadius: 5, fontSize: 13, fontWeight: 600 }}>
            <Upload size={14} /> Restore from backup
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: "none" }} />
        </div>
        {pendingImport && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F5E4DE", border: "1px solid #E3B8A8", borderRadius: 6, padding: "10px 14px", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: "#8A3A22" }}>This will replace all current data with the backup file. Continue?</span>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 10 }}>
              <button onClick={() => setPendingImport(null)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 10px", fontSize: 12.5 }}>Cancel</button>
              <button
                onClick={() => {
                  onImportAll(pendingImport);
                  setPendingImport(null);
                }}
                style={{ background: "#B5482F", color: "#FAF8F3", border: "none", borderRadius: 5, padding: "5px 10px", fontSize: 12.5, fontWeight: 600 }}
              >
                Yes, restore
              </button>
            </div>
          </div>
        )}
        {importError && <div style={{ color: "#B5482F", fontSize: 12 }}>{importError}</div>}
      </div>
    </div>
  );
}

// ---------- Expenses ----------
const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Wages", "Materials", "Transport", "Marketing", "Other"];
const EXPENSE_CATEGORY_COLORS = {
  Rent: { color: "#8A6D3D", bg: "#F3EBDA" },
  Utilities: { color: "#3D6B5C", bg: "#E3EDE8" },
  Wages: { color: "#1B2A3D", bg: "#E0E5EC" },
  Materials: { color: "#6E6A5C", bg: "#EDEAE2" },
  Transport: { color: "#4A6B8A", bg: "#DFE7EE" },
  Marketing: { color: "#8A4A6B", bg: "#EEDFE7" },
  Other: { color: "#7A7566", bg: "#EDEAE2" },
};
function ExpenseCategoryBadge({ category }) {
  const c = EXPENSE_CATEGORY_COLORS[category] || { color: "#6E6A5C", bg: "#EDEAE2" };
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>
      {category || "—"}
    </span>
  );
}

function ExpensesPanel({ expenses, updateExpenses, showToast, purchaseOrders, onLinkPO, onTrash }) {
  const blank = { date: todayISO(), category: EXPENSE_CATEGORIES[0], payee: "", description: "", amount: 0, paymentMethod: "Cash", reference: "", notes: "", poId: "" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [formError, setFormError] = useState("");

  const unpaidPOs = useMemo(
    () => (purchaseOrders || []).filter((po) => po.status !== "cancelled"),
    [purchaseOrders]
  );

  function pickPO(poId) {
    const po = (purchaseOrders || []).find((p) => p.id === poId);
    if (!po) {
      setForm({ ...form, poId: "" });
      return;
    }
    const { total } = calcTotals(po);
    setForm({
      ...form,
      poId,
      payee: po.clientName || form.payee,
      amount: +total.toFixed(2),
      reference: po.quoteNumber,
      category: "Materials",
      description: form.description || `Payment for ${po.quoteNumber}`,
    });
  }

  function addOrUpdate() {
    if (!form.payee.trim() && !form.description.trim()) {
      setFormError("Enter a payee or description before saving.");
      showToast("Enter a payee or description first");
      return;
    }
    setFormError("");
    if (editingId) {
      updateExpenses(expenses.map((e) => (e.id === editingId ? { ...e, ...form } : e)));
      showToast("Expense updated");
    } else {
      updateExpenses([{ id: uid(), ...form }, ...expenses]);
      showToast("Expense added");
    }
    if (form.poId && onLinkPO) onLinkPO(form.poId);
    setForm(blank);
    setEditingId(null);
  }
  function edit(e) {
    setForm({ date: e.date || todayISO(), category: e.category || EXPENSE_CATEGORIES[0], payee: e.payee || "", description: e.description || "", amount: e.amount ?? 0, paymentMethod: e.paymentMethod || "Cash", reference: e.reference || "", notes: e.notes || "", poId: e.poId || "" });
    setEditingId(e.id);
  }
  function remove(id) {
    const exp = expenses.find((x) => x.id === id);
    updateExpenses(expenses.filter((e) => e.id !== id));
    if (exp && onTrash) onTrash(exp.description || exp.payee || "Expense", exp);
    showToast("Expense moved to trash");
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const filtered = filter === "all" ? expenses : expenses.filter((e) => e.category === filter);
  const filteredTotal = filtered.reduce((s, e) => s + num(e.amount), 0);
  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Expenses</h1>
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ width: 340, flexShrink: 0 }}>
          <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}><Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: "100%", minWidth: 0 }} /></Field></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Category">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            {unpaidPOs.length > 0 && (
              <Field label="Link to Purchase Order (optional)">
                <select value={form.poId} onChange={(e) => pickPO(e.target.value)} style={{ ...inputStyle }}>
                  <option value="">— none —</option>
                  {unpaidPOs.map((po) => {
                    const { total } = calcTotals(po);
                    return (
                      <option key={po.id} value={po.id}>
                        {po.quoteNumber} — {po.clientName || "Unknown supplier"} — {money(total)}{po.status === "paid" ? " (already paid)" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
            )}
            {form.poId && (
              <div style={{ fontSize: 11.5, color: "#3D6B5C", background: "#E3EDE8", border: "1px solid #C8DCD2", borderRadius: 5, padding: "6px 10px", marginBottom: 14, marginTop: -6 }}>
                Saving will mark this purchase order as paid to supplier.
              </div>
            )}
            <Field label="Paid to (payee) *"><TextInput value={form.payee} onChange={(e) => { setForm({ ...form, payee: e.target.value }); setFormError(""); }} placeholder="e.g. City Power & Water" style={formError ? { borderColor: "#B5482F" } : undefined} /></Field>
            <Field label="Description *"><TextInput value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setFormError(""); }} placeholder="e.g. June electricity bill" style={formError ? { borderColor: "#B5482F" } : undefined} /></Field>
            <div style={{ fontSize: 11, color: "#8A8574", marginTop: -10, marginBottom: 14 }}>* at least one of payee or description is required</div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}><Field label="Amount ($)"><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: "100%", minWidth: 0 }} /></Field></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Payment method">
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Reference # (optional)"><TextInput value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="receipt or invoice #" /></Field>
            <Field label="Notes (optional)"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {formError && <div style={{ color: "#B5482F", fontSize: 12.5, marginBottom: 10 }}>{formError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addOrUpdate} style={{ flex: 1, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
                {editingId ? "Save changes" : "Add expense"}
              </button>
              {editingId && <button onClick={() => { setEditingId(null); setForm(blank); setFormError(""); }} style={{ background: "none", border: "1px solid #DAD5C6", padding: "8px 12px", borderRadius: 5, fontSize: 13.5 }}>Cancel</button>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["all", ...EXPENSE_CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  style={{
                    background: filter === c ? "#1B2A3D" : "transparent",
                    color: filter === c ? "#FAF8F3" : "#6E6A5C",
                    border: "none",
                    borderRadius: 5,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
            {filtered.length > 0 && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: "#B5482F" }}>
                Total: {money(filteredTotal)}
              </div>
            )}
          </div>

          {sorted.length === 0 ? (
            <EmptyState title={expenses.length === 0 ? "No expenses yet" : "Nothing in this category"} body="Log business expenses here to track spend and see it reflected on your dashboard." />
          ) : (
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                    {["Date", "Category", "Payee", "Description", "PO", "Amount", "Method", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e, idx) => (
                    <tr key={e.id} onClick={() => edit(e)} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9", cursor: "pointer" }}>
                      <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{fmtDate(e.date)}</td>
                      <td style={{ padding: "11px 14px" }}><ExpenseCategoryBadge category={e.category} /></td>
                      <td style={{ padding: "11px 14px" }}>{e.payee || "—"}</td>
                      <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{e.description || "—"}</td>
                      <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", color: "#6E6A5C" }}>{e.reference || "—"}</td>
                      <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{money(num(e.amount))}</td>
                      <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{e.paymentMethod}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <button onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 4 }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Schedule ----------
const SCHEDULE_TYPES = [
  { value: "measurement", label: "Measurement visit", color: "#8A6D3D", bg: "#F3EBDA" },
  { value: "install", label: "Installation", color: "#3D6B5C", bg: "#E3EDE8" },
  { value: "other", label: "Other", color: "#6E6A5C", bg: "#EDEAE2" },
];
function ScheduleTypeBadge({ type }) {
  const t = SCHEDULE_TYPES.find((x) => x.value === type) || SCHEDULE_TYPES[2];
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: t.color, background: t.bg, padding: "3px 8px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>
      {t.label}
    </span>
  );
}

function SchedulePanel({ schedule, updateSchedule, clients, showToast, onTrash }) {
  const blank = { date: todayISO(), time: "09:00", type: "measurement", clientId: "", clientName: "", address: "", phone: "", notes: "", status: "upcoming" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState("upcoming"); // upcoming | past | all

  function pickClient(clientId) {
    const c = clients.find((c) => c.id === clientId);
    setForm({ ...form, clientId, clientName: c?.name || form.clientName, address: c?.address || form.address, phone: c?.phone || form.phone });
  }
  function addOrUpdate() {
    if (!form.clientName.trim()) {
      showToast("Enter a client name first");
      return;
    }
    if (editingId) {
      updateSchedule(schedule.map((s) => (s.id === editingId ? { ...s, ...form } : s)));
      showToast("Visit updated");
    } else {
      updateSchedule([{ id: uid(), ...form }, ...schedule]);
      showToast("Visit scheduled");
    }
    setForm(blank);
    setEditingId(null);
  }
  function edit(s) {
    setForm({ date: s.date || todayISO(), time: s.time || "09:00", type: s.type || "measurement", clientId: s.clientId || "", clientName: s.clientName || "", address: s.address || "", phone: s.phone || "", notes: s.notes || "", status: s.status || "upcoming" });
    setEditingId(s.id);
  }
  function remove(id) {
    const s = schedule.find((x) => x.id === id);
    updateSchedule(schedule.filter((s) => s.id !== id));
    if (s && onTrash) onTrash(`${s.clientName} — ${fmtDate(s.date)}`, s);
    showToast("Visit moved to trash");
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }
  function setStatus(id, status) {
    updateSchedule(schedule.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  const sorted = [...schedule].sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
  const today = todayISO();
  const filtered = sorted.filter((s) => {
    if (tab === "upcoming") return s.date >= today && s.status !== "cancelled" && s.status !== "done";
    if (tab === "past") return s.date < today || s.status === "done" || s.status === "cancelled";
    return true;
  });

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Schedule</h1>
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}><Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: "100%" }} /></Field></div>
              <div style={{ width: 110 }}><Field label="Time"><TextInput type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field></div>
            </div>
            <Field label="Visit type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ ...inputStyle }}>
                {SCHEDULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            {clients.length > 0 && (
              <Field label="Client (optional lookup)">
                <select value={form.clientId} onChange={(e) => pickClient(e.target.value)} style={{ ...inputStyle }}>
                  <option value="">— type manually below —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Client name"><TextInput value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}><Field label="Address"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ width: "100%" }} /></Field></div>
              <div style={{ width: 130 }}><Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></div>
            </div>
            <Field label="Notes"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addOrUpdate} style={{ flex: 1, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
                {editingId ? "Save changes" : "Schedule visit"}
              </button>
              {editingId && <button onClick={() => { setEditingId(null); setForm(blank); }} style={{ background: "none", border: "1px solid #DAD5C6", padding: "8px 12px", borderRadius: 5, fontSize: 13.5 }}>Cancel</button>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {[["upcoming", "Upcoming"], ["past", "Past / done"], ["all", "All"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{ background: tab === key ? "#1B2A3D" : "transparent", color: tab === key ? "#FAF8F3" : "#6E6A5C", border: "none", borderRadius: 5, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title={schedule.length === 0 ? "Nothing scheduled yet" : "Nothing here"} body="Schedule a measurement visit or installation to keep track of site work." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((s) => (
                <div key={s.id} onClick={() => edit(s)} style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: "14px 16px", background: "#FFFDF9", cursor: "pointer", opacity: s.status === "cancelled" ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1B2A3D" }}>{fmtDate(s.date)}{s.time ? ` · ${s.time}` : ""}</span>
                        <ScheduleTypeBadge type={s.type} />
                        {s.status === "done" && <span style={{ fontSize: 11, color: "#3D6B5C", fontWeight: 600 }}>✓ Done</span>}
                        {s.status === "cancelled" && <span style={{ fontSize: 11, color: "#B5482F", fontWeight: 600 }}>Cancelled</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{s.clientName}</div>
                      <div style={{ fontSize: 12.5, color: "#6E6A5C" }}>{s.phone}{s.phone && s.address ? " · " : ""}{s.address}</div>
                      {s.notes && <div style={{ fontSize: 12, color: "#8A8574", marginTop: 4 }}>{s.notes}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {s.status !== "done" && <button onClick={() => setStatus(s.id, "done")} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>Mark done</button>}
                      {s.status !== "cancelled" && s.status !== "done" && <button onClick={() => setStatus(s.id, "cancelled")} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>Cancel</button>}
                      <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", color: "#B5482F", padding: 5 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Clients ----------
function ClientsPanel({ clients, updateClients, showToast, onTrash }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [noteText, setNoteText] = useState("");

  function addOrUpdate() {
    if (!form.name.trim()) {
      showToast("Enter a name first");
      return;
    }
    if (editingId) {
      updateClients(clients.map((c) => (c.id === editingId ? { ...c, ...form } : c)));
      showToast("Client updated");
    } else {
      updateClients([{ id: uid(), notes: [], ...form }, ...clients]);
      showToast("Client added");
    }
    setForm({ name: "", email: "", phone: "", address: "" });
    setEditingId(null);
  }
  function edit(c) { setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "" }); setEditingId(c.id); }
  function remove(id) {
    const c = clients.find((x) => x.id === id);
    updateClients(clients.filter((c) => c.id !== id));
    if (c && onTrash) onTrash(c.name, c);
    showToast("Client moved to trash");
    if (editingId === id) { setEditingId(null); setForm({ name: "", email: "", phone: "", address: "" }); }
  }
  function addNote(clientId) {
    if (!noteText.trim()) return;
    updateClients(clients.map((c) => (c.id === clientId ? { ...c, notes: [{ id: uid(), date: todayISO(), text: noteText.trim() }, ...(c.notes || [])] } : c)));
    setNoteText("");
  }
  function removeNote(clientId, noteId) {
    updateClients(clients.map((c) => (c.id === clientId ? { ...c, notes: (c.notes || []).filter((n) => n.id !== noteId) } : c)));
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Clients</h1>
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
            <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Apple Uk" /></Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="077896988" /></Field>
            <Field label="Email"><TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" /></Field>
            <Field label="Address">
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Arey Khsat Borey Toul Songkea, #309 St.05" />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addOrUpdate} style={{ flex: 1, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
                {editingId ? "Save changes" : "Add client"}
              </button>
              {editingId && <button onClick={() => { setEditingId(null); setForm({ name: "", email: "", phone: "", address: "" }); }} style={{ background: "none", border: "1px solid #DAD5C6", padding: "8px 12px", borderRadius: 5, fontSize: 13.5 }}>Cancel</button>}
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {clients.length === 0 ? (
            <EmptyState title="No clients yet" body="Add a client on the left to bill them." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {clients.map((c) => {
                const isOpen = expandedId === c.id;
                const notes = c.notes || [];
                return (
                  <div key={c.id} style={{ border: "1px solid #E4DFD3", borderRadius: 8, background: "#FFFDF9" }}>
                    <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(isOpen ? null : c.id)}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}{notes.length > 0 && <span style={{ fontSize: 11, color: "#8A8574", fontWeight: 400, marginLeft: 8 }}>{notes.length} note{notes.length === 1 ? "" : "s"}</span>}</div>
                        <div style={{ fontSize: 13, color: "#6E6A5C" }}>{c.phone}{c.phone && c.email ? " · " : ""}{c.email}</div>
                        {c.address && <div style={{ fontSize: 12.5, color: "#8A8574", marginTop: 2 }}>{c.address}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => edit(c)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "6px 10px", fontSize: 12.5 }}>Edit</button>
                        <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", color: "#B5482F", padding: 6 }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: "1px solid #E4DFD3", padding: "14px 16px" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8574", marginBottom: 8 }}>Activity notes</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                          <TextInput value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Called to confirm install date" style={{ flex: 1 }} />
                          <button onClick={() => addNote(c.id)} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 14px", borderRadius: 5, fontSize: 13, fontWeight: 600 }}>Add</button>
                        </div>
                        {notes.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: "#8A8574" }}>No notes yet.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {notes.map((n) => (
                              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderLeft: "2px solid #DAD5C6", paddingLeft: 10 }}>
                                <div>
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A8574", marginRight: 8 }}>{fmtDate(n.date)}</span>
                                  {n.text}
                                </div>
                                <button onClick={() => removeNote(c.id, n.id)} style={{ background: "none", border: "none", color: "#B5482F", flexShrink: 0 }}><X size={13} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Items (catalog) ----------
const ITEM_UNITS = [
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "pcs", label: "pcs" },
  { value: "ea", label: "ea" },
  { value: "set", label: "set" },
];
const ITEM_CATEGORIES = ["Curtain", "Blinds"];
const CATEGORY_COLORS = { Curtain: { color: "#8A6D3D", bg: "#F3EBDA" }, Blinds: { color: "#3D6B5C", bg: "#E3EDE8" } };

function CategoryBadge({ category }) {
  const c = CATEGORY_COLORS[category] || { color: "#6E6A5C", bg: "#EDEAE2" };
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>
      {category || "—"}
    </span>
  );
}

function marginPct(rate, cost) {
  const r = num(rate), c = num(cost);
  if (r <= 0) return 0;
  return ((r - c) / r) * 100;
}

const CSV_TEMPLATE = "Category,Code,Description,Supplier Name,Unit,Cost,Rate,Stock\nCurtain,LKA 328-4,Curtain Fabric 320cm,ABC Fabric Supply,m2,6.00,10.50,25\nBlinds,AW101 50mm,Wooden Blinds,Sunshade Supplies,m2,18.00,30.00,40\n";

function slugKey(k) {
  return String(k || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findField(row, candidates) {
  const entries = Object.keys(row).map((k) => [slugKey(k), row[k]]);
  for (const cand of candidates) {
    const hit = entries.find(([k]) => k === cand);
    if (hit && hit[1] !== undefined && String(hit[1]).trim() !== "") return String(hit[1]).trim();
  }
  return "";
}
function matchCategory(value) {
  const hit = ITEM_CATEGORIES.find((c) => c.toLowerCase() === value.toLowerCase());
  return hit || value || ITEM_CATEGORIES[0];
}
function matchUnit(value) {
  const hit = ITEM_UNITS.find((u) => u.value.toLowerCase() === value.toLowerCase() || u.label.toLowerCase() === value.toLowerCase());
  return hit ? hit.value : value || "m2";
}

function parseItemsCsv(text) {
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = result.data || [];
  const parsed = [];
  let skipped = 0;
  rows.forEach((row) => {
    const desc = findField(row, ["description", "desc", "name", "item", "itemname"]);
    if (!desc) { skipped++; return; }
    parsed.push({
      id: uid(),
      desc,
      code: findField(row, ["code", "sku"]),
      category: matchCategory(findField(row, ["category", "cat"])),
      supplierName: findField(row, ["supplier", "suppliername", "vendor"]),
      unit: matchUnit(findField(row, ["unit", "uom"])),
      cost: num(findField(row, ["cost", "costprice"])),
      rate: num(findField(row, ["rate", "price", "sellprice", "sellingprice"])),
      stock: num(findField(row, ["stock", "qty", "quantity", "inventory", "stockonhand"])),
    });
  });
  return { parsed, skipped };
}

function ItemsPanel({ items, updateItems, showToast, onTrash }) {
  const [form, setForm] = useState({ code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0, stock: 0, lowStockThreshold: 5, warrantyMonths: 0, imageDataUrl: "" });
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState("");
  const [imageError, setImageError] = useState("");
  const [selected, setSelected] = useState([]);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const blank = { code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0, stock: 0, lowStockThreshold: 5, warrantyMonths: 0, imageDataUrl: "" };

  const preview = useMemo(() => (csvText.trim() ? parseItemsCsv(csvText) : { parsed: [], skipped: 0 }), [csvText]);

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.onerror = () => setImportError("Couldn't read that file — try again or paste the data instead.");
    reader.readAsText(file);
  }
  function commitImport() {
    if (preview.parsed.length === 0) {
      setImportError("Nothing to import — check that your file has a Description column.");
      return;
    }
    updateItems([...preview.parsed, ...items]);
    showToast(`Imported ${preview.parsed.length} item${preview.parsed.length === 1 ? "" : "s"}${preview.skipped ? ` · skipped ${preview.skipped}` : ""}`);
    setCsvText("");
    setImportError("");
    setShowImport(false);
  }
  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "items-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportItemsExcel() {
    const rows = filtered.map((it) => ({
      Category: it.category || "",
      Code: it.code || "",
      Description: it.desc || "",
      Supplier: it.supplierName || "",
      Unit: ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit || "",
      Stock: num(it.stock),
      Cost: num(it.cost),
      Rate: num(it.rate),
      "Margin %": +marginPct(it.rate, it.cost).toFixed(1),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, `items_${todayISO()}.xlsx`);
  }
  function handleItemImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setImageError("Image is too large — please use one under ~3.5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imageDataUrl: reader.result }));
    reader.onerror = () => setImageError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  }

  function addOrUpdate() {
    if (!form.desc.trim()) {
      showToast("Enter a description first");
      return;
    }
    if (editingId) {
      updateItems(items.map((it) => (it.id === editingId ? { ...it, ...form } : it)));
      showToast("Item updated");
    } else {
      updateItems([{ id: uid(), ...form }, ...items]);
      showToast("Item added");
    }
    setForm(blank);
    setEditingId(null);
  }
  function edit(it) { setForm({ code: it.code || "", desc: it.desc, category: it.category || ITEM_CATEGORIES[0], unit: it.unit || "m2", supplierName: it.supplierName || "", cost: it.cost ?? 0, rate: it.rate ?? 0, stock: it.stock ?? 0, lowStockThreshold: it.lowStockThreshold ?? 5, warrantyMonths: it.warrantyMonths ?? 0, imageDataUrl: it.imageDataUrl || "" }); setEditingId(it.id); }
  function remove(id) {
    const it = items.find((x) => x.id === id);
    updateItems(items.filter((it) => it.id !== id));
    if (it && onTrash) onTrash(it.desc, it);
    showToast("Item moved to trash");
    if (editingId === id) { setEditingId(null); setForm(blank); }
    setSelected((s) => s.filter((x) => x !== id));
  }
  function toggleSelect(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setConfirmingBulkDelete(false);
  }
  function toggleSelectAll(visibleIds) {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])]);
    setConfirmingBulkDelete(false);
  }
  function bulkDelete() {
    if (selected.length === 0) return;
    const removedItems = items.filter((it) => selected.includes(it.id));
    updateItems(items.filter((it) => !selected.includes(it.id)));
    if (onTrash) removedItems.forEach((it) => onTrash(it.desc, it));
    showToast(`Moved ${selected.length} item${selected.length === 1 ? "" : "s"} to trash`);
    if (editingId && selected.includes(editingId)) { setEditingId(null); setForm(blank); }
    setSelected([]);
    setConfirmingBulkDelete(false);
  }

  const byCategory = filter === "all" ? items : filter === "lowstock" ? items.filter((it) => num(it.stock) <= num(it.lowStockThreshold ?? 5)) : items.filter((it) => it.category === filter);
  const sq = search.trim().toLowerCase();
  const filtered = !sq
    ? byCategory
    : byCategory.filter((it) =>
        (it.supplierName || "").toLowerCase().includes(sq) ||
        (it.code || "").toLowerCase().includes(sq) ||
        (it.desc || "").toLowerCase().includes(sq)
      );
  const formMargin = marginPct(form.rate, form.cost);
  const formProfit = num(form.rate) - num(form.cost);
  const lowStockCount = items.filter((it) => num(it.stock) <= num(it.lowStockThreshold ?? 5)).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Items</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {items.length > 0 && (
            <button onClick={exportItemsExcel} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", color: "#1B2A3D", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
              <Download size={15} /> Export Excel
            </button>
          )}
          <button onClick={() => setShowImport((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", color: "#1B2A3D", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
            <Upload size={15} /> {showImport ? "Close import" : "Mass upload"}
          </button>
        </div>
      </div>

      {showImport && (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Mass upload items</div>
              <div style={{ fontSize: 12.5, color: "#8A8574" }}>Upload a CSV with columns: Category, Code, Description, Supplier Name, Unit, Cost, Rate. Only Description is required.</div>
            </div>
            <button onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#1B2A3D", flexShrink: 0 }}>
              <Download size={13} /> Download template
            </button>
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 14px", borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Upload size={14} /> Choose CSV file
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: "none" }} />
            </label>
            {csvText && <button onClick={() => { setCsvText(""); setImportError(""); }} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "8px 14px", fontSize: 13 }}>Clear</button>}
          </div>

          <Field label="Or paste CSV data">
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setImportError(""); }}
              placeholder="Category,Code,Description,Supplier Name,Unit,Cost,Rate&#10;Curtain,LKA 328-4,Curtain Fabric 320cm,ABC Fabric Supply,m2,6.00,10.50"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}
            />
          </Field>

          {csvText.trim() && (
            <div style={{ fontSize: 12.5, color: preview.parsed.length ? "#3D6B5C" : "#B5482F", marginBottom: 10, fontWeight: 600 }}>
              {preview.parsed.length} item{preview.parsed.length === 1 ? "" : "s"} ready to import{preview.skipped ? ` · ${preview.skipped} row${preview.skipped === 1 ? "" : "s"} skipped (missing description)` : ""}
            </div>
          )}

          {preview.parsed.length > 0 && (
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 6, overflow: "hidden", marginBottom: 14, maxHeight: 180, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#F1EDE3", textAlign: "left", position: "sticky", top: 0 }}>
                    {["Category", "Code", "Description", "Supplier", "Unit", "Stock", "Cost", "Rate"].map((h) => (
                      <th key={h} style={{ padding: "7px 10px", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "#8A8574", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.parsed.slice(0, 8).map((it) => (
                    <tr key={it.id} style={{ borderTop: "1px solid #EDEAE2" }}>
                      <td style={{ padding: "6px 10px" }}>{it.category}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{it.code || "—"}</td>
                      <td style={{ padding: "6px 10px" }}>{it.desc}</td>
                      <td style={{ padding: "6px 10px" }}>{it.supplierName || "—"}</td>
                      <td style={{ padding: "6px 10px" }}>{it.unit}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{it.stock}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(it.cost)}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(it.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.parsed.length > 8 && <div style={{ padding: "6px 10px", fontSize: 11.5, color: "#8A8574" }}>+ {preview.parsed.length - 8} more…</div>}
            </div>
          )}

          {importError && <div style={{ color: "#B5482F", fontSize: 12.5, marginBottom: 10 }}>{importError}</div>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={commitImport} disabled={preview.parsed.length === 0} style={{ background: preview.parsed.length ? "#1B2A3D" : "#DAD5C6", color: "#FAF8F3", border: "none", padding: "8px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600, cursor: preview.parsed.length ? "pointer" : "not-allowed" }}>
              Import {preview.parsed.length || ""} item{preview.parsed.length === 1 ? "" : "s"}
            </button>
            <button onClick={() => setShowImport(false)} style={{ background: "none", border: "1px solid #DAD5C6", padding: "8px 16px", borderRadius: 5, fontSize: 13.5 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
            <Field label="Photo">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, border: "1px solid #DAD5C6", background: "#FFFDF9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                  {form.imageDataUrl ? (
                    <img src={form.imageDataUrl} alt="Item preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8A8574" }}>none</span>
                  )}
                </div>
                <div>
                  <label style={{ display: "inline-block", background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    Upload photo
                    <input type="file" accept="image/*" onChange={handleItemImage} style={{ display: "none" }} />
                  </label>
                  {form.imageDataUrl && (
                    <button onClick={() => setForm({ ...form, imageDataUrl: "" })} style={{ marginLeft: 8, background: "none", border: "none", color: "#B5482F", fontSize: 12.5 }}>Remove</button>
                  )}
                  {imageError && <div style={{ color: "#B5482F", fontSize: 11.5, marginTop: 5 }}>{imageError}</div>}
                </div>
              </div>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ ...inputStyle }}>
                {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Code"><TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="AW101 50mm" /></Field>
            <Field label="Description"><TextInput value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Wooden Blinds" /></Field>
            <Field label="Unit">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ ...inputStyle }}>
                {ITEM_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Field>
            <Field label="Supplier name"><TextInput value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="e.g. ABC Fabric Supply" /></Field>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Cost ($)"><TextInput type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Rate ($)"><TextInput type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field></div>
            </div>
            <Field label={`Stock on hand (${ITEM_UNITS.find((u) => u.value === form.unit)?.label || form.unit})`}><TextInput type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="Low-stock alert below"><TextInput type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /></Field>
            <Field label="Warranty (months, 0 = none)"><TextInput type="number" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })} /></Field>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", color: formMargin < 0 ? "#B5482F" : "#3D6B5C", marginBottom: 14, marginTop: -6, padding: "6px 10px", background: "#F1EDE3", borderRadius: 4 }}>
              <span>Margin: {formMargin.toFixed(1)}%</span>
              <span>Profit: {money(formProfit)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addOrUpdate} style={{ flex: 1, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
                {editingId ? "Save changes" : "Add item"}
              </button>
              {editingId && <button onClick={() => { setEditingId(null); setForm(blank); }} style={{ background: "none", border: "1px solid #DAD5C6", padding: "8px 12px", borderRadius: 5, fontSize: 13.5 }}>Cancel</button>}
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 10 }}>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by supplier, code, or description…"
              style={{ maxWidth: 360 }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
            {["all", ...ITEM_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                style={{
                  background: filter === c ? "#1B2A3D" : "transparent",
                  color: filter === c ? "#FAF8F3" : "#6E6A5C",
                  border: "none",
                  borderRadius: 5,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
            {lowStockCount > 0 && (
              <button
                onClick={() => setFilter("lowstock")}
                style={{
                  background: filter === "lowstock" ? "#B5482F" : "#F5E4DE",
                  color: filter === "lowstock" ? "#FAF8F3" : "#B5482F",
                  border: "none",
                  borderRadius: 5,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <AlertTriangle size={12} /> Low stock ({lowStockCount})
              </button>
            )}
          </div>

          {selected.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1B2A3D", color: "#FAF8F3", borderRadius: 6, padding: "8px 14px", marginBottom: 10 }}>
              {confirmingBulkDelete ? (
                <>
                  <span style={{ fontSize: 13 }}>Move {selected.length} item{selected.length === 1 ? "" : "s"} to trash?</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setConfirmingBulkDelete(false)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.35)", color: "#FAF8F3", borderRadius: 5, padding: "5px 10px", fontSize: 12.5 }}>Cancel</button>
                    <button onClick={bulkDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#B5482F", border: "none", color: "#FAF8F3", borderRadius: 5, padding: "5px 10px", fontSize: 12.5, fontWeight: 600 }}>
                      <Trash2 size={12} /> Yes, delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>{selected.length} selected</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setSelected([])} style={{ background: "none", border: "1px solid rgba(255,255,255,0.35)", color: "#FAF8F3", borderRadius: 5, padding: "5px 10px", fontSize: 12.5 }}>Clear</button>
                    <button onClick={() => setConfirmingBulkDelete(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "#B5482F", border: "none", color: "#FAF8F3", borderRadius: 5, padding: "5px 10px", fontSize: 12.5, fontWeight: 600 }}>
                      <Trash2 size={12} /> Delete selected
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title={items.length === 0 ? "No items yet" : sq ? "No matches" : "Nothing in this category"} body={sq ? "Try a different search term." : "Register products or services here so you can add them to invoices with one click."} />
          ) : (
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((it) => selected.includes(it.id))}
                        onChange={() => toggleSelectAll(filtered.map((it) => it.id))}
                      />
                    </th>
                    {["", "Category", "Code", "Description", "Supplier", "Unit", "Stock", "Cost", "Rate", "Margin", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it, idx) => {
                    const m = marginPct(it.rate, it.cost);
                    return (
                      <tr key={it.id} style={{ borderTop: "1px solid #E4DFD3", background: selected.includes(it.id) ? "#F1EDE3" : idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                        <td style={{ padding: "11px 14px" }}>
                          <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggleSelect(it.id)} />
                        </td>
                        <td style={{ padding: "8px 0 8px 14px" }}>
                          <div style={{ width: 34, height: 34, borderRadius: 5, overflow: "hidden", background: "#F1EDE3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {it.imageDataUrl ? <img src={it.imageDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={14} color="#B7AF98" />}
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px" }}><CategoryBadge category={it.category} /></td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{it.code || "—"}</td>
                        <td style={{ padding: "11px 14px" }}>{it.desc}</td>
                        <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{it.supplierName || "—"}</td>
                        <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: num(it.stock) <= num(it.lowStockThreshold ?? 5) ? "#B5482F" : "#1B2A3D" }}>
                          {num(it.stock)}
                          {num(it.stock) <= num(it.lowStockThreshold ?? 5) && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: "-1px" }} />}
                        </td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", color: "#6E6A5C" }}>{money(num(it.cost))}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(num(it.rate))}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", color: m < 0 ? "#B5482F" : "#3D6B5C", fontWeight: 600 }}>{m.toFixed(1)}%</td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => edit(it)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>Edit</button>
                            <button onClick={() => remove(it.id)} style={{ background: "none", border: "none", color: "#B5482F", padding: 5 }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Invoice Editor ----------
function InvoiceEditor({ invoice, clients, items, onChange, onDone, onBack }) {
  const { subtotal, discount, taxAmt, depositAmt, total } = calcTotals(invoice);
  const depositMode = invoice.depositMode || "percent";
  const depositDisplayValue = invoice.depositValue !== undefined && invoice.depositValue !== "" ? invoice.depositValue : (invoice.depositPct ?? 0);
  const isPO = invoice.docType === "po";
  const isQuote = invoice.docType === "quotation";
  const suppliers = useMemo(() => [...new Set(items.map((it) => it.supplierName).filter(Boolean))], [items]);
  const docLabel = isPO ? "purchase order" : isQuote ? "quotation" : "invoice";
  const numberLabel = isPO ? "PO #" : isQuote ? "Quote #" : "Invoice #";
  const [codeDropdownRow, setCodeDropdownRow] = useState(null);

  function setRow(rowId, patch) {
    onChange({ rows: invoice.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) });
  }
  function setRowCode(rowId, code) {
    setRow(rowId, { code });
    setCodeDropdownRow(code.trim() ? rowId : null);
  }
  function pickCodeSuggestion(rowId, item) {
    setRow(rowId, {
      code: item.code,
      desc: item.desc,
      unit: item.unit || "",
      rate: isPO ? num(item.cost) : num(item.rate),
    });
    setCodeDropdownRow(null);
  }
  function setRowWithM2Suggest(rowId, patch) {
    const row = invoice.rows.find((r) => r.id === rowId);
    const updated = { ...row, ...patch };
    if (["w", "h", "qty"].some((k) => k in patch)) {
      updated.m2 = suggestM2(updated);
    }
    setRow(rowId, updated);
  }
  function addItem() {
    onChange({ rows: [...invoice.rows, { id: uid(), kind: "item", desc: "", code: "", w: "", h: "", qty: 1, unit: "", m2: "", rate: 0 }] });
  }
  function addItemFromCatalog(itemId) {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    const patch = { rows: [...invoice.rows, { id: uid(), kind: "item", desc: it.desc, code: it.code || "", w: "", h: "", qty: 1, unit: it.unit || "", m2: "", rate: isPO ? num(it.cost) : num(it.rate) }] };
    if (isPO && !invoice.clientName && it.supplierName) patch.clientName = it.supplierName;
    onChange(patch);
  }
  function addSection() {
    onChange({ rows: [...invoice.rows, { id: uid(), kind: "section", label: "" }] });
  }
  function removeRow(rowId) {
    onChange({ rows: invoice.rows.filter((r) => r.id !== rowId) });
  }
  function pickClient(clientId) {
    const c = clients.find((c) => c.id === clientId);
    onChange({ clientId, clientName: c?.name || "", clientAddress: c?.address || "", clientPhone: c?.phone || "" });
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <button onClick={onBack} className="no-print" style={backBtnStyle}><ArrowLeft size={14} /> All {isPO ? "purchase orders" : "invoices"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "14px 0 22px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, margin: 0 }}>Editing {docLabel} {invoice.quoteNumber}</h1>
        <button onClick={onDone} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 18px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Done</button>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        <div style={{ width: 160 }}><Field label={numberLabel}><TextInput value={invoice.quoteNumber} onChange={(e) => onChange({ quoteNumber: e.target.value })} /></Field></div>
        {!isPO && <div style={{ width: 160 }}><Field label="Customer ID"><TextInput value={invoice.customerId} onChange={(e) => onChange({ customerId: e.target.value })} /></Field></div>}
        <div style={{ width: 160 }}><Field label="Date"><TextInput type="date" value={invoice.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} /></Field></div>
        {isPO && <div style={{ width: 160 }}><Field label="Expected delivery"><TextInput type="date" value={invoice.expectedDate} onChange={(e) => onChange({ expectedDate: e.target.value })} /></Field></div>}
      </div>

      {!isPO && !isQuote && (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: "12px 16px", marginBottom: 16, background: "#FFFDF9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: (invoice.recurring?.enabled ? 10 : 0) }}>
            <button
              onClick={() => onChange({ recurring: { frequency: "monthly", nextDate: addMonths(invoice.issueDate || todayISO(), 1), ...invoice.recurring, enabled: !invoice.recurring?.enabled } })}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <span style={{ width: 32, height: 18, borderRadius: 9, background: invoice.recurring?.enabled ? "#3D6B5C" : "#DAD5C6", position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 2, left: invoice.recurring?.enabled ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#FFFDF9", transition: "left 0.15s" }} />
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2A3D" }}>Make this a recurring invoice</span>
            </button>
          </div>
          {invoice.recurring?.enabled && (
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ width: 160 }}>
                <Field label="Repeats">
                  <select value={invoice.recurring.frequency} onChange={(e) => onChange({ recurring: { ...invoice.recurring, frequency: e.target.value } })} style={{ ...inputStyle }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </Field>
              </div>
              <div style={{ width: 160 }}>
                <Field label="Next invoice date"><TextInput type="date" value={invoice.recurring.nextDate} onChange={(e) => onChange({ recurring: { ...invoice.recurring, nextDate: e.target.value } })} /></Field>
              </div>
              <div style={{ fontSize: 11.5, color: "#8A8574", alignSelf: "center", marginTop: 8 }}>A new draft invoice will be created automatically next time the app is opened on or after this date.</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {isPO ? (
          <div style={{ flex: 1 }}>
            <Field label="Supplier name">
              <TextInput list="po-suppliers" value={invoice.clientName} onChange={(e) => onChange({ clientName: e.target.value })} placeholder="e.g. ABC Fabric Supply" />
              <datalist id="po-suppliers">
                {suppliers.map((s) => <option key={s} value={s} />)}
              </datalist>
            </Field>
          </div>
        ) : (
          <div style={{ width: 240 }}>
            <Field label="Client">
              <select value={invoice.clientId || ""} onChange={(e) => pickClient(e.target.value)} style={{ ...inputStyle }}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        {!isPO && <div style={{ flex: 1 }}><Field label="To (name)"><TextInput value={invoice.clientName} onChange={(e) => onChange({ clientName: e.target.value })} /></Field></div>}
        <div style={{ width: 160 }}><Field label="Phone"><TextInput value={invoice.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} /></Field></div>
      </div>
      <Field label={isPO ? "Supplier address" : "Address"}><TextInput value={invoice.clientAddress} onChange={(e) => onChange({ clientAddress: e.target.value })} /></Field>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "visible", marginTop: 12, marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F1EDE3" }}>
              <th style={{ ...thStyle, width: 40 }}>No</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 100 }}>Code</th>
              <th style={{ ...thStyle, width: 60 }}>W</th>
              <th style={{ ...thStyle, width: 60 }}>H</th>
              <th style={{ ...thStyle, width: 55 }}>Qty</th>
              <th style={{ ...thStyle, width: 75 }}>UoM</th>
              <th style={{ ...thStyle, width: 65 }}>M²</th>
              <th style={{ ...thStyle, width: 80 }}>{isPO ? "Cost/m²" : "Rate/m²"}</th>
              <th style={{ ...thStyle, width: 90 }}>Amount</th>
              <th style={{ ...thStyle, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let n = 0;
              return invoice.rows.map((r) =>
                r.kind === "section" ? (
                  <tr key={r.id} style={{ borderTop: "1px solid #E4DFD3", background: "#EAF0F5" }}>
                    <td colSpan={10} style={{ padding: "4px 10px" }}>
                      <input value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} placeholder="Section label (e.g. Ground floor)" style={{ ...inputStyle, border: "none", background: "transparent", fontWeight: 600, textAlign: "center", padding: "4px" }} />
                    </td>
                    <td style={tdStyle}><button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", color: "#B5482F" }}><X size={14} /></button></td>
                  </tr>
                ) : (
                  (() => {
                    n += 1;
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid #E4DFD3" }}>
                        <td style={{ ...tdStyle, padding: "7px 8px", fontFamily: "'IBM Plex Mono', monospace", color: "#8A8574", textAlign: "center" }}>{n}</td>
                        <td style={tdStyle}><input value={r.desc} onChange={(e) => setRow(r.id, { desc: e.target.value })} placeholder="Wooden Blinds" style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={{ ...tdStyle, position: "relative" }}>
                          <input
                            value={r.code}
                            onChange={(e) => setRowCode(r.id, e.target.value)}
                            onFocus={() => r.code.trim() && setCodeDropdownRow(r.id)}
                            onBlur={() => setTimeout(() => setCodeDropdownRow((cur) => (cur === r.id ? null : cur)), 150)}
                            placeholder="AW101 50mm"
                            style={{ ...inputStyle, border: "none", padding: "7px 8px" }}
                          />
                          {codeDropdownRow === r.id && (() => {
                            const q = r.code.trim().toLowerCase();
                            const matches = items.filter((it) => (it.code || "").toLowerCase().includes(q) || (it.desc || "").toLowerCase().includes(q)).slice(0, 6);
                            if (matches.length === 0) return null;
                            return (
                              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, width: 260, background: "#FFFDF9", border: "1px solid #DAD5C6", borderRadius: 6, boxShadow: "0 6px 16px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                                {matches.map((it) => (
                                  <div
                                    key={it.id}
                                    onMouseDown={() => pickCodeSuggestion(r.id, it)}
                                    style={{ padding: "8px 10px", fontSize: 12.5, cursor: "pointer", borderBottom: "1px solid #EDEAE2" }}
                                  >
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#1B2A3D" }}>{it.code || "(no code)"}</div>
                                    <div style={{ color: "#6E6A5C" }}>{it.desc} — {money(num(isPO ? it.cost : it.rate))}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                        <td style={tdStyle}><input type="number" value={r.w} onChange={(e) => setRowWithM2Suggest(r.id, { w: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.h} onChange={(e) => setRowWithM2Suggest(r.id, { h: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.qty} onChange={(e) => setRowWithM2Suggest(r.id, { qty: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}>
                          <select value={r.unit || ""} onChange={(e) => setRow(r.id, { unit: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }}>
                            <option value=""></option>
                            {ITEM_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}><input type="number" value={r.m2} onChange={(e) => setRow(r.id, { m2: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.rate} onChange={(e) => setRow(r.id, { rate: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", padding: "7px 8px" }}>{money(rowAmount(r))}</td>
                        <td style={tdStyle}><button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", color: "#B5482F" }}><X size={14} /></button></td>
                      </tr>
                    );
                  })()
                )
              );
            })()}
          </tbody>
        </table>
        <div style={{ padding: 10, borderTop: "1px solid #E4DFD3", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#3D6B5C", fontSize: 13, fontWeight: 600 }}><Plus size={14} /> Add item</button>
          <button onClick={addSection} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#6E6A5C", fontSize: 13, fontWeight: 600 }}><Rows3 size={14} /> Add section divider</button>
          {items.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) addItemFromCatalog(e.target.value); e.target.value = ""; }}
              style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12.5, color: "#8A6D3D", borderColor: "#DAD5C6" }}
            >
              <option value="">+ Add from catalog…</option>
              {ITEM_CATEGORIES.map((cat) => {
                const catItems = items.filter((it) => it.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {catItems.map((it) => <option key={it.id} value={it.id}>{it.desc}{it.code ? ` (${it.code})` : ""} — {isPO ? "cost " : ""}{money(num(isPO ? it.cost : it.rate))}</option>)}
                  </optgroup>
                );
              })}
              {items.some((it) => !it.category) && (
                <optgroup label="Uncategorized">
                  {items.filter((it) => !it.category).map((it) => <option key={it.id} value={it.id}>{it.desc}{it.code ? ` (${it.code})` : ""} — {isPO ? "cost " : ""}{money(num(isPO ? it.cost : it.rate))}</option>)}
                </optgroup>
              )}
            </select>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#8A8574", marginBottom: 18 }}>M² auto-fills from W × H × Qty ÷ 10,000 — edit it directly to override. Start typing in Code to see matching items from your catalog and pick one to auto-fill.</div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <Field label="Terms & conditions"><textarea value={invoice.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} rows={5} placeholder="(leave blank to use default terms from Business info)" style={{ ...inputStyle, resize: "vertical" }} /></Field>
        </div>
        <div style={{ width: 240 }}>
          <Field label="Discount ($)"><TextInput type="number" value={invoice.discount} onChange={(e) => onChange({ discount: e.target.value })} /></Field>
          <Field label="Tax">
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ display: "flex", border: "1px solid #DAD5C6", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                <button
                  onClick={() => onChange({ taxMode: "percent" })}
                  style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, border: "none", background: (invoice.taxMode || "percent") === "percent" ? "#1B2A3D" : "#FFFDF9", color: (invoice.taxMode || "percent") === "percent" ? "#FAF8F3" : "#6E6A5C" }}
                >
                  %
                </button>
                <button
                  onClick={() => onChange({ taxMode: "amount" })}
                  style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, border: "none", borderLeft: "1px solid #DAD5C6", background: invoice.taxMode === "amount" ? "#1B2A3D" : "#FFFDF9", color: invoice.taxMode === "amount" ? "#FAF8F3" : "#6E6A5C" }}
                >
                  $
                </button>
              </div>
              <TextInput type="number" value={invoice.taxValue ?? 0} onChange={(e) => onChange({ taxValue: e.target.value })} placeholder="e.g. 10 for VAT" />
            </div>
          </Field>
          <Field label="Deposit">
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ display: "flex", border: "1px solid #DAD5C6", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                <button
                  onClick={() => onChange({ depositMode: "percent" })}
                  style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, border: "none", background: depositMode === "percent" ? "#1B2A3D" : "#FFFDF9", color: depositMode === "percent" ? "#FAF8F3" : "#6E6A5C" }}
                >
                  %
                </button>
                <button
                  onClick={() => onChange({ depositMode: "amount" })}
                  style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, border: "none", borderLeft: "1px solid #DAD5C6", background: depositMode === "amount" ? "#1B2A3D" : "#FFFDF9", color: depositMode === "amount" ? "#FAF8F3" : "#6E6A5C" }}
                >
                  $
                </button>
              </div>
              <TextInput type="number" value={depositDisplayValue} onChange={(e) => onChange({ depositValue: e.target.value })} />
            </div>
          </Field>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginTop: 8 }}>
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Discount" value={"-" + money(discount)} />
            <Row label={(invoice.taxMode || "percent") === "percent" ? `Tax (${invoice.taxValue || 0}%)` : "Tax"} value={money(taxAmt)} />
            <Row label={depositMode === "percent" ? `Deposit (${depositDisplayValue || 0}%)` : "Deposit"} value={money(depositAmt)} />
            <Row label="Balance due" value={money(total)} bold />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Field label="Site photos (internal — not printed)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(invoice.photos || []).map((p) => (
              <div key={p.id} style={{ position: "relative", width: 84, height: 84, borderRadius: 6, overflow: "hidden", border: "1px solid #DAD5C6" }}>
                <img src={p.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => onChange({ photos: (invoice.photos || []).filter((x) => x.id !== p.id) })}
                  style={{ position: "absolute", top: 2, right: 2, background: "rgba(27,42,61,0.8)", border: "none", borderRadius: 3, color: "#FAF8F3", padding: 2, lineHeight: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <label style={{ width: 84, height: 84, borderRadius: 6, border: "1px dashed #DAD5C6", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8574" }}>
              <Upload size={18} />
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/") && f.size <= 4 * 1024 * 1024);
                  e.target.value = "";
                  if (files.length === 0) return;
                  Promise.all(
                    files.map(
                      (file) =>
                        new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve({ id: uid(), dataUrl: reader.result });
                          reader.onerror = () => resolve(null);
                          reader.readAsDataURL(file);
                        })
                    )
                  ).then((newPhotos) => {
                    onChange({ photos: [...(invoice.photos || []), ...newPhotos.filter(Boolean)] });
                  });
                }}
              />
            </label>
          </div>
        </Field>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: bold ? 700 : 400, borderTop: bold ? "1px solid #DAD5C6" : "none", marginTop: bold ? 4 : 0 }}>
      <span style={{ color: bold ? "#1B2A3D" : "#6E6A5C" }}>{label}</span><span>{value}</span>
    </div>
  );
}

const thStyle = { padding: "8px 8px", textAlign: "left", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 };
const tdStyle = { padding: "1px 0" };
const backBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#6E6A5C", fontSize: 13, padding: 0 };

// ---------- Invoice View (printable) ----------
function InvoiceView({ invoice, settings, onBack, onEdit, onStatus, onDelete, onConvert, onConvertToReceipt, onAddPayment, onRemovePayment }) {
  const { subtotal, discount, taxMode, taxValue, taxAmt, depositAmt, total, depositMode, depositValue, amountPaid, balanceDue } = calcTotals(invoice);
  const status = effectiveStatus(invoice);
  const terms = (invoice.notes && invoice.notes.trim()) ? invoice.notes : settings.terms;
  const initials = (settings.businessName || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const isQuote = invoice.docType === "quotation";
  const isPO = invoice.docType === "po";
  const docLabelShare = isPO ? "Purchase Order" : isQuote ? "Quotation" : "Invoice";
  const shareText = `${settings.businessName} — ${docLabelShare} ${invoice.quoteNumber}\n${isPO ? "Supplier" : "Client"}: ${invoice.clientName || "—"}\nDate: ${fmtDate(invoice.issueDate)}\nTotal: ${money(total)}${settings.showKHR && num(settings.exchangeRate) > 0 ? ` (≈ ${khr(total, settings.exchangeRate)})` : ""}`;
  const [payAmount, setPayAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : "");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payDate, setPayDate] = useState(todayISO());
  function submitPayment() {
    const amt = num(payAmount);
    if (amt <= 0) return;
    onAddPayment({ amount: amt, method: payMethod, date: payDate });
    setPayAmount("");
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}><ArrowLeft size={14} /> All {isPO ? "purchase orders" : "invoices"}</button>
        <div style={{ display: "flex", gap: 8 }}>
          {isQuote ? (
            <>
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status !== "accepted" && status !== "declined" && <ActionBtn icon={<Check size={13} />} label="Mark accepted" onClick={() => onStatus("accepted")} />}
              {status !== "declined" && status !== "accepted" && <ActionBtn icon={<X size={13} />} label="Mark declined" onClick={() => onStatus("declined")} />}
              {status === "accepted" && <ActionBtn icon={<FileText size={13} />} label="Convert to invoice" onClick={onConvert} />}
            </>
          ) : isPO ? (
            <>
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status !== "received" && status !== "paid" && status !== "cancelled" && <ActionBtn icon={<Check size={13} />} label="Mark received" onClick={() => onStatus("received")} />}
              {status !== "paid" && status !== "cancelled" && <ActionBtn icon={<Check size={13} />} label="Mark paid to supplier" onClick={() => onStatus("paid")} />}
              {status !== "cancelled" && status !== "paid" && <ActionBtn icon={<X size={13} />} label="Cancel" onClick={() => onStatus("cancelled")} />}
            </>
          ) : (
            <>
              {status !== "paid" && <ActionBtn icon={<Check size={13} />} label="Mark paid" onClick={() => (balanceDue > 0 ? onAddPayment({ amount: balanceDue, method: "Cash", date: todayISO() }) : onStatus("paid"))} />}
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status === "paid" && <ActionBtn icon={<FileText size={13} />} label="Create receipt" onClick={onConvertToReceipt} />}
            </>
          )}
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={handlePrintSafe} />
          <ActionBtn icon={<MessageCircle size={13} />} label="WhatsApp" onClick={() => shareViaWhatsApp(shareText, invoice.clientPhone)} />
          <ActionBtn icon={<Send size={13} />} label="Telegram" onClick={() => shareViaTelegram(shareText)} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={onDelete} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", color: "#B5482F" }}><Trash2 size={13} /></button>
        </div>
      </div>

      {!isPO && !isQuote && invoice.stockDeducted && (
        <div className="no-print" style={{ fontSize: 12, color: "#3D6B5C", background: "#E3EDE8", border: "1px solid #C8DCD2", borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>
          Inventory was deducted for this invoice's items.
        </div>
      )}

      {!isPO && !isQuote && status !== "draft" && (
        <div className="no-print" style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 16, background: "#FFFDF9", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600 }}>Payments</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: balanceDue > 0 ? "#B5482F" : "#3D6B5C", fontWeight: 600 }}>
              {money(amountPaid)} paid · {money(balanceDue)} remaining
            </div>
          </div>
          {(invoice.payments || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {invoice.payments.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #EDEAE2", paddingBottom: 6 }}>
                  <span>{fmtDate(p.date)} · {p.method}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{money(num(p.amount))}</span>
                    <button onClick={() => onRemovePayment(p.id)} style={{ background: "none", border: "none", color: "#B5482F" }}><X size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {balanceDue > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 110 }}><Field label="Date"><TextInput type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field></div>
              <div style={{ width: 110 }}><Field label="Amount"><TextInput type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></Field></div>
              <div style={{ width: 130 }}>
                <Field label="Method">
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ ...inputStyle }}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <button onClick={submitPayment} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "8px 14px", borderRadius: 5, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Record payment</button>
            </div>
          )}
        </div>
      )}

      {(invoice.photos || []).length > 0 && (
        <div className="no-print" style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 16, background: "#FFFDF9", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Site photos</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {invoice.photos.map((p) => (
              <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer">
                <img src={p.dataUrl} alt="" style={{ width: 84, height: 84, borderRadius: 6, objectFit: "cover", border: "1px solid #DAD5C6" }} />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="print-sheet" style={{ background: "#FFFDF9", border: "1px solid #E4DFD3", borderRadius: 10, padding: "40px 44px", fontFamily: "'Source Serif 4','Noto Sans Khmer',Georgia,serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "#1B2A3D", color: "#FAF8F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>
                {initials}
              </div>
            )}
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 700 }}>{settings.businessName}</div>
              {settings.tagline && <div style={{ fontSize: 11.5, color: "#8A8574", letterSpacing: "0.03em" }}>{settings.tagline}</div>}
              {settings.address && <div style={{ fontSize: 12, color: "#6E6A5C", marginTop: 4, whiteSpace: "pre-line" }}>{settings.address}</div>}
              {settings.phone && <div style={{ fontSize: 12, color: "#6E6A5C" }}>Tel: {settings.phone}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Noto Sans Khmer', sans-serif", fontSize: 32, fontWeight: 700, color: "#1B2A3D", letterSpacing: "0.01em" }}>{isPO ? "លិខិតបញ្ជាទិញ" : isQuote ? "សម្រង់តម្លៃ" : "វិក្កយបត្រ"}</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600, color: "#6E6A5C", letterSpacing: "0.06em", marginTop: 2 }}>{isPO ? "PURCHASE ORDER" : isQuote ? "QUOTATION" : "INVOICE"}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6E6A5C", marginTop: 6 }}>
              <div>Date: {fmtDate(invoice.issueDate)}</div>
              <div>{isPO ? "PO #" : isQuote ? "Quote #" : "Invoice #"}: {invoice.quoteNumber}</div>
              {invoice.customerId && <div>Customer ID: {invoice.customerId}</div>}
              {isPO && invoice.expectedDate && <div>Expected: {fmtDate(invoice.expectedDate)}</div>}
            </div>
            {isPO && <div style={{ marginTop: 6 }}><Badge status={status} /></div>}
          </div>
        </div>

        <div style={{ borderTop: "2px solid #1B2A3D", borderBottom: "1px solid #E4DFD3", padding: "12px 0", marginBottom: 20, fontSize: 13.5 }}>
          <div><span style={labelInline}>{isPO ? "To (supplier):" : "To:"}</span> <strong>{invoice.clientName || "—"}</strong></div>
          {invoice.clientAddress && <div><span style={labelInline}>Add:</span> {invoice.clientAddress}</div>}
          {invoice.clientPhone && <div><span style={labelInline}>Phone:</span> {invoice.clientPhone}</div>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 4 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #1B2A3D" }}>
              <th style={{ ...printTh, width: 28 }}>No</th>
              <th style={printTh}>Description</th>
              <th style={printTh}>Code</th>
              <th style={{ ...printTh, textAlign: "right" }}>W</th>
              <th style={{ ...printTh, textAlign: "right" }}>H</th>
              <th style={{ ...printTh, textAlign: "right" }}>Qty</th>
              <th style={{ ...printTh, textAlign: "right" }}>UoM</th>
              <th style={{ ...printTh, textAlign: "right" }}>M²</th>
              <th style={{ ...printTh, textAlign: "right" }}>{isPO ? "Cost/m²" : "Rate/m²"}</th>
              <th style={{ ...printTh, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let n = 0;
              return invoice.rows.map((r) =>
                r.kind === "section" ? (
                  <tr key={r.id}>
                    <td colSpan={10} style={{ background: "#DCE7F0", textAlign: "center", fontWeight: 600, padding: "5px 0", fontSize: 12 }}>{r.label || "—"}</td>
                  </tr>
                ) : (
                  (() => {
                    n += 1;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #EDEAE2" }}>
                        <td style={printTd}>{n}</td>
                        <td style={printTd}>{r.desc}</td>
                        <td style={printTd}>{r.code}</td>
                        <td style={{ ...printTd, textAlign: "right" }}>{r.w}</td>
                        <td style={{ ...printTd, textAlign: "right" }}>{r.h}</td>
                        <td style={{ ...printTd, textAlign: "right" }}>{r.qty}</td>
                        <td style={{ ...printTd, textAlign: "right" }}>{ITEM_UNITS.find((u) => u.value === r.unit)?.label || r.unit || ""}</td>
                        <td style={{ ...printTd, textAlign: "right" }}>{r.m2}</td>
                        <td style={{ ...printTd, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{r.rate !== "" ? money(num(r.rate)) : ""}</td>
                        <td style={{ ...printTd, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{money(rowAmount(r))}</td>
                      </tr>
                    );
                  })()
                )
              );
            })()}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 24 }}>
          <div style={{ flex: 1, fontSize: 12, color: "#6E6A5C", whiteSpace: "pre-line" }}>
            <div style={{ fontWeight: 700, color: "#1B2A3D", marginBottom: 4, fontSize: 12.5 }}>Terms and Condition</div>
            {terms}
          </div>
          <div style={{ width: 230, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Discount" value={discount ? "-" + money(discount) : money(0)} />
            {num(taxValue) > 0 && <Row label={taxMode === "percent" ? `Tax ${taxValue}%` : "Tax"} value={money(taxAmt)} />}
            <Row label={depositMode === "percent" ? `Deposit ${depositValue || 0}%` : "Deposit"} value={money(depositAmt)} />
            <div style={{ border: "1px solid #1B2A3D", borderRadius: 4, padding: "6px 10px", display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 700 }}>
              <span>Total</span><span>{money(total)}</span>
            </div>
            {settings.showKHR && num(settings.exchangeRate) > 0 && (
              <div style={{ textAlign: "right", fontSize: 11.5, color: "#8A8574", marginTop: 3 }}>≈ {khr(total, settings.exchangeRate)}</div>
            )}
            {!isQuote && !isPO && amountPaid > 0 && (
              <>
                <Row label="Paid" value={"-" + money(amountPaid)} />
                <Row label="Balance due" value={money(balanceDue)} bold />
              </>
            )}
          </div>
        </div>

        {!isQuote && !isPO && settings.khqrPayload && balanceDue > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
            <div style={{ textAlign: "center", border: "1px solid #DAD5C6", borderRadius: 8, padding: 12, background: "#FFFDF9" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(settings.khqrPayload)}`}
                alt="KHQR payment code"
                width={160}
                height={160}
                style={{ display: "block" }}
              />
              <div style={{ fontSize: 11, color: "#8A8574", marginTop: 6 }}>Scan to pay via KHQR</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48 }}>
          <div style={{ fontSize: 13, textAlign: isPO ? "center" : "left" }}>
            <div style={{ width: 160, marginBottom: 6, height: 28, fontFamily: isPO ? "'Fraunces', serif" : undefined, fontStyle: isPO ? "italic" : undefined, color: isPO ? "#3D6B5C" : undefined, borderBottom: "1px solid #C9C3B0" }}>{isPO ? settings.sellerName : ""}</div>
            {isPO ? "Buyer" : "Client"}
          </div>
          <div style={{ fontSize: 13, textAlign: "center" }}>
            <div style={{ width: 160, marginBottom: 6, height: 28, fontFamily: isPO ? undefined : "'Fraunces', serif", fontStyle: isPO ? undefined : "italic", color: isPO ? undefined : "#3D6B5C", borderBottom: "1px solid #C9C3B0" }}>{isPO ? "" : settings.sellerName}</div>
            {isPO ? "Received by (supplier)" : "Seller"}
          </div>
        </div>

        {settings.thanksNote && <div style={{ textAlign: "center", marginTop: 30, fontWeight: 600, fontSize: 13.5, color: "#1B2A3D" }}>{settings.thanksNote}</div>}
      </div>
    </div>
  );
}

const labelInline = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#8A8574", textTransform: "uppercase", letterSpacing: "0.05em" };
const printTh = { padding: "0 8px 7px 0", textAlign: "left", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 };
const printTd = { padding: "6px 8px 6px 0" };

function ActionBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#1B2A3D" }}>
      {icon} {label}
    </button>
  );
}

// ---------- Receipt List ----------
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque", "Other"];

function ReceiptList({ invoices, onOpen, onNew, onDelete }) {
  const receipts = invoices.filter((i) => i.docType === "receipt");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Receipts</h1>
        <button onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
          <Plus size={15} /> New receipt
        </button>
      </div>

      {receipts.length === 0 ? (
        <EmptyState title="No receipts yet" body="Issue a receipt for a payment you've received, or create one from a paid invoice." action={{ label: "New receipt", onClick: onNew }} />
      ) : (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                {["Receipt #", "Client", "For invoice", "Date", "Amount received", "Method", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, idx) => (
                <tr key={r.id} onClick={() => onOpen(r.id)} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                  <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{r.quoteNumber}</td>
                  <td style={{ padding: "11px 14px" }}>{r.clientName || "—"}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{r.invoiceRef || "—"}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{fmtDate(r.issueDate)}</td>
                  <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(num(r.amountReceived))}</td>
                  <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{r.paymentMethod}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(r.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 4 }} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Receipt Editor ----------
function ReceiptEditor({ receipt, clients, onChange, onDone, onBack }) {
  function pickClient(clientId) {
    const c = clients.find((c) => c.id === clientId);
    onChange({ clientId, clientName: c?.name || "", clientAddress: c?.address || "", clientPhone: c?.phone || "" });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <button onClick={onBack} className="no-print" style={backBtnStyle}><ArrowLeft size={14} /> All receipts</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "14px 0 22px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, margin: 0 }}>Editing receipt {receipt.quoteNumber}</h1>
        <button onClick={onDone} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 18px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Done</button>
      </div>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ width: 180 }}><Field label="Receipt #"><TextInput value={receipt.quoteNumber} onChange={(e) => onChange({ quoteNumber: e.target.value })} /></Field></div>
          <div style={{ width: 180 }}><Field label="Date"><TextInput type="date" value={receipt.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} /></Field></div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Field label="Client">
              <select value={receipt.clientId || ""} onChange={(e) => pickClient(e.target.value)} style={{ ...inputStyle }}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ width: 180 }}><Field label="For invoice # (optional)"><TextInput value={receipt.invoiceRef} onChange={(e) => onChange({ invoiceRef: e.target.value })} placeholder="e.g. 20260001" /></Field></div>
        </div>

        <Field label="Received from (name)"><TextInput value={receipt.clientName} onChange={(e) => onChange({ clientName: e.target.value })} /></Field>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="Address"><TextInput value={receipt.clientAddress} onChange={(e) => onChange({ clientAddress: e.target.value })} /></Field></div>
          <div style={{ width: 160 }}><Field label="Phone"><TextInput value={receipt.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} /></Field></div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ width: 180 }}><Field label="Amount received ($)"><TextInput type="number" value={receipt.amountReceived} onChange={(e) => onChange({ amountReceived: e.target.value })} /></Field></div>
          <div style={{ width: 180 }}>
            <Field label="Payment method">
              <select value={receipt.paymentMethod} onChange={(e) => onChange({ paymentMethod: e.target.value })} style={{ ...inputStyle }}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ width: 160 }}><Field label="Balance remaining ($)"><TextInput type="number" value={receipt.balanceRemaining} onChange={(e) => onChange({ balanceRemaining: e.target.value })} /></Field></div>
        </div>

        <Field label="Notes"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={receipt.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>
      </div>
    </div>
  );
}

// ---------- Receipt View (printable) ----------
function ReceiptView({ receipt, settings, onBack, onEdit, onDelete }) {
  const initials = (settings.businessName || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const balance = num(receipt.balanceRemaining);
  const shareText = `${settings.businessName} — Receipt ${receipt.quoteNumber}\nReceived from: ${receipt.clientName || "—"}\nDate: ${fmtDate(receipt.issueDate)}\nAmount: ${money(num(receipt.amountReceived))}${settings.showKHR && num(settings.exchangeRate) > 0 ? ` (≈ ${khr(num(receipt.amountReceived), settings.exchangeRate)})` : ""}`;

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}><ArrowLeft size={14} /> All receipts</button>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={handlePrintSafe} />
          <ActionBtn icon={<MessageCircle size={13} />} label="WhatsApp" onClick={() => shareViaWhatsApp(shareText, receipt.clientPhone)} />
          <ActionBtn icon={<Send size={13} />} label="Telegram" onClick={() => shareViaTelegram(shareText)} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={onDelete} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", color: "#B5482F" }}><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="print-sheet" style={{ background: "#FFFDF9", border: "1px solid #E4DFD3", borderRadius: 10, padding: "40px 44px", fontFamily: "'Source Serif 4','Noto Sans Khmer',Georgia,serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "#1B2A3D", color: "#FAF8F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>
                {initials}
              </div>
            )}
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 700 }}>{settings.businessName}</div>
              {settings.tagline && <div style={{ fontSize: 11.5, color: "#8A8574", letterSpacing: "0.03em" }}>{settings.tagline}</div>}
              {settings.address && <div style={{ fontSize: 12, color: "#6E6A5C", marginTop: 4, whiteSpace: "pre-line" }}>{settings.address}</div>}
              {settings.phone && <div style={{ fontSize: 12, color: "#6E6A5C" }}>Tel: {settings.phone}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#1B2A3D", letterSpacing: "0.02em" }}>RECEIPT</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6E6A5C", marginTop: 6 }}>
              <div>Date: {fmtDate(receipt.issueDate)}</div>
              <div>Receipt #: {receipt.quoteNumber}</div>
              {receipt.invoiceRef && <div>For invoice #: {receipt.invoiceRef}</div>}
            </div>
          </div>
        </div>

        <div style={{ borderTop: "2px solid #1B2A3D", borderBottom: "1px solid #E4DFD3", padding: "12px 0", marginBottom: 26, fontSize: 13.5 }}>
          <div><span style={labelInline}>Received from:</span> <strong>{receipt.clientName || "—"}</strong></div>
          {receipt.clientAddress && <div><span style={labelInline}>Add:</span> {receipt.clientAddress}</div>}
          {receipt.clientPhone && <div><span style={labelInline}>Phone:</span> {receipt.clientPhone}</div>}
        </div>

        <div style={{ textAlign: "center", padding: "18px 0", marginBottom: 22, border: "1px solid #DAD5C6", borderRadius: 8, background: "#F6F2E9" }}>
          <div style={labelInline}>Amount received</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, color: "#1B2A3D", marginTop: 4 }}>{money(num(receipt.amountReceived))}</div>
          {settings.showKHR && num(settings.exchangeRate) > 0 && (
            <div style={{ fontSize: 12, color: "#8A8574", marginTop: 2 }}>≈ {khr(num(receipt.amountReceived), settings.exchangeRate)}</div>
          )}
          <div style={{ fontSize: 12.5, color: "#6E6A5C", marginTop: 4 }}>via {receipt.paymentMethod}</div>
        </div>

        {balance > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "0 4px", marginBottom: 22, color: "#B5482F", fontWeight: 600 }}>
            <span>Balance remaining</span><span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{money(balance)}</span>
          </div>
        )}

        {receipt.notes && <div style={{ fontSize: 13, color: "#6E6A5C", marginBottom: 26, whiteSpace: "pre-line" }}>{receipt.notes}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34 }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ borderBottom: "1px solid #C9C3B0", width: 160, marginBottom: 6, height: 28 }} />
            Customer
          </div>
          <div style={{ fontSize: 13, textAlign: "center" }}>
            <div style={{ width: 160, marginBottom: 6, height: 28, fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#3D6B5C", borderBottom: "1px solid #C9C3B0" }}>{settings.sellerName}</div>
            Received by
          </div>
        </div>

        {settings.thanksNote && <div style={{ textAlign: "center", marginTop: 30, fontWeight: 600, fontSize: 13.5, color: "#1B2A3D" }}>{settings.thanksNote}</div>}
      </div>
    </div>
  );
}
