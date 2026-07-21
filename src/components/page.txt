"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2, FileText, Users, ArrowLeft, Printer, Check, Send, X, Settings as SettingsIcon, Rows3, LayoutDashboard, TrendingUp, AlertTriangle, Percent, Package } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/lib/supabaseClient";

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const money = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
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
};

function effectiveStatus(inv) {
  if (inv.docType === "quotation") return inv.status;
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
  const depositMode = inv.depositMode || "percent";
  const depositValue = inv.depositValue !== undefined && inv.depositValue !== "" ? inv.depositValue : inv.depositPct;
  const depositAmtRaw = depositMode === "amount" ? num(depositValue) : afterDiscount * (num(depositValue) / 100);
  const depositAmt = Math.max(Math.min(depositAmtRaw, afterDiscount), 0);
  const total = afterDiscount - depositAmt;
  return { subtotal, discount, depositAmt, total, depositMode, depositValue: num(depositValue) };
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

// ---------- storage (Supabase) ----------
// Each row stores its full object in a `data` jsonb column, keyed by the app's own `id`.
// `settings` is a single row with id = 1.
const DEFAULT_SETTINGS = {
  businessName: "Your Business",
  tagline: "",
  address: "",
  phone: "",
  sellerName: "",
  logoDataUrl: "",
  terms: "- Goods cannot be refunded\n- Leadtime 10-15 days after confirmed",
  thanksNote: "Thank you for your business!",
};

async function loadTable(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: true });
  if (error) { console.error(`load ${table}:`, error.message); return []; }
  return (data || []).map((row) => row.data);
}

async function loadAll() {
  const out = { clients: [], invoices: [], settings: DEFAULT_SETTINGS, items: [] };
  try {
    out.clients = await loadTable("clients");
  } catch (e) { console.error(e); }
  try {
    out.invoices = await loadTable("invoices");
  } catch (e) { console.error(e); }
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data) out.settings = { ...DEFAULT_SETTINGS, ...data.data };
  } catch (e) { console.error("load settings:", e); }
  try {
    out.items = await loadTable("items");
  } catch (e) { console.error(e); }
  return out;
}

// Full-replace sync: deletes everything currently in the table and re-inserts the
// given list. Simple and safe for a single-user / small-team app; if you later need
// multiple people editing at once, switch this to incremental upsert + delete-by-diff.
async function saveTable(table, rows) {
  try {
    const { error: delErr } = await supabase.from(table).delete().not("id", "is", null);
    if (delErr) throw delErr;
    if (rows.length) {
      const payload = rows.map((r) => ({ id: r.id, data: r }));
      const { error: insErr } = await supabase.from(table).insert(payload);
      if (insErr) throw insErr;
    }
  } catch (e) { console.error(`save ${table}:`, e.message || e); }
}

async function saveClients(clients) { await saveTable("clients", clients); }
async function saveInvoices(invoices) { await saveTable("invoices", invoices); }
async function saveItems(items) { await saveTable("items", items); }
async function saveSettings(settings) {
  try {
    const { error } = await supabase.from("settings").upsert({ id: 1, data: settings });
    if (error) throw error;
  } catch (e) { console.error("save settings:", e.message || e); }
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
  const [view, setView] = useState("dashboard");
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAll().then((data) => {
      setClients(data.clients);
      setInvoices(data.invoices);
      setSettings(data.settings);
      setItems(data.items);
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
        status: "draft",
        clientId: clients[0]?.id || null,
        clientName: clients[0]?.name || "",
        clientAddress: clients[0]?.address || "",
        clientPhone: clients[0]?.phone || "",
        rows: [{ id: uid(), kind: "item", desc: "", code: "", w: "", h: "", qty: 1, m2: "", rate: 0 }],
        discount: 0,
        depositMode: "percent",
        depositValue: 0,
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
    updateInvoices(invoices.filter((i) => i.id !== id));
    if (activeInvoiceId === id) {
      const dt = doc?.docType;
      setView(dt === "quotation" ? "quotations" : dt === "receipt" ? "receipts" : "invoices");
    }
  }
  function patchInvoice(id, patch) {
    updateInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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

  return (
    <div className="app-shell" style={shellStyle}>
      <style>{fontImport}</style>
      <div className="no-print" style={{ width: 220, flexShrink: 0, borderRight: "1px solid #E4DFD3", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "0 8px 20px 8px" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: "#1B2A3D" }}>Ledger</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#8A8574", letterSpacing: "0.05em" }}>invoicing, kept simple</div>
        </div>
        <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={15} />} label="Dashboard" onClick={() => setView("dashboard")} />
        <NavButton active={view === "invoices"} icon={<FileText size={15} />} label="Invoices" onClick={() => setView("invoices")} />
        <NavButton active={view === "quotations"} icon={<FileText size={15} />} label="Quotations" onClick={() => setView("quotations")} />
        <NavButton active={view === "receipts"} icon={<FileText size={15} />} label="Receipts" onClick={() => setView("receipts")} />
        <NavButton active={view === "clients"} icon={<Users size={15} />} label="Clients" onClick={() => setView("clients")} />
        <NavButton active={view === "items"} icon={<Package size={15} />} label="Items" onClick={() => setView("items")} />
        <NavButton active={view === "settings"} icon={<SettingsIcon size={15} />} label="Business info" onClick={() => setView("settings")} />
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
            onOpen={(id) => { setActiveInvoiceId(id); setView("invoice-view"); }}
            onNewInvoice={() => createDoc("invoice")}
            onNewQuotation={() => createDoc("quotation")}
            onNewReceipt={() => createDoc("receipt")}
          />
        )}
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
        {view === "clients" && <ClientsPanel clients={clients} updateClients={updateClients} showToast={showToast} />}
        {view === "items" && <ItemsPanel items={items} updateItems={updateItems} showToast={showToast} />}
        {view === "settings" && <SettingsPanel settings={settings} updateSettings={updateSettings} showToast={showToast} />}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptEditor receipt={activeInvoice} clients={clients} onChange={(patch) => patchInvoice(activeInvoice.id, patch)} onDone={() => setView("invoice-view")} onBack={() => setView("receipts")} />
        )}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceEditor invoice={activeInvoice} clients={clients} items={items} onChange={(patch) => patchInvoice(activeInvoice.id, patch)} onDone={() => setView("invoice-view")} onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : "invoices")} />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptView receipt={activeInvoice} settings={settings} onBack={() => setView("receipts")} onEdit={() => setView("invoice-edit")} onDelete={() => deleteInvoice(activeInvoice.id)} />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceView invoice={activeInvoice} settings={settings} onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : "invoices")} onEdit={() => setView("invoice-edit")} onStatus={(status) => patchInvoice(activeInvoice.id, { status })} onDelete={() => deleteInvoice(activeInvoice.id)} onConvert={() => convertToInvoice(activeInvoice.id)} onConvertToReceipt={() => convertToReceipt(activeInvoice.id)} />
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
@media print {
  .no-print { display: none !important; }
  html, body { height: auto !important; background: white !important; }
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
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  @page { margin: 14mm; }
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
function Dashboard({ invoices, onOpen, onNewInvoice, onNewQuotation, onNewReceipt }) {
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

    const months = lastNMonthKeys(6);
    const monthData = months.map((key) => {
      let invoiced = 0, collected = 0;
      invOnly.forEach((inv) => {
        if (monthKey(inv.issueDate) === key) {
          const { total } = calcTotals(inv);
          invoiced += total;
          if (inv.status === "paid") collected += total;
        }
      });
      return { month: monthLabel(key), Invoiced: +invoiced.toFixed(2), Collected: +collected.toFixed(2) };
    });

    const pieData = Object.entries(statusAmounts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: STATUS[key]?.label || key, value: +value.toFixed(2), color: STATUS[key]?.color || "#999" }));

    const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recent = [...invoices]
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""))
      .slice(0, 6);

    const totalReceipted = receiptsOnly.reduce((s, r) => s + num(r.amountReceived), 0);

    return { totalPaid, totalOutstanding, totalOverdue, quoteOpenValue, acceptRate, quoteCount: quotesOnly.length, monthData, pieData, topClients, recent, totalReceipted, receiptCount: receiptsOnly.length };
  }, [invoices]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onNewQuotation} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", color: "#1B2A3D", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
            <Plus size={15} /> New quotation
          </button>
          <button onClick={onNewReceipt} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #DAD5C6", color: "#1B2A3D", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
            <Plus size={15} /> New receipt
          </button>
          <button onClick={onNewInvoice} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
            <Plus size={15} /> New invoice
          </button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="Nothing to report yet" body="Create an invoice or quotation and your numbers will show up here." action={{ label: "New invoice", onClick: onNewInvoice }} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
              <div style={panelTitle}>Revenue, last 6 months</div>
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
                    const amount = isReceipt ? num(inv.amountReceived) : calcTotals(inv).total;
                    const status = isReceipt ? null : effectiveStatus(inv);
                    const typeLabel = isReceipt ? "RCPT" : isQuote ? "QUOTE" : "INV";
                    const typeColor = isReceipt ? "#1B2A3D" : isQuote ? "#8A6D3D" : "#3D6B5C";
                    return (
                      <tr key={inv.id} onClick={() => onOpen(inv.id)} style={{ borderTop: "1px solid #E4DFD3", cursor: "pointer" }}>
                        <td style={{ padding: "9px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: typeColor, fontWeight: 600, whiteSpace: "nowrap" }}>{typeLabel}</td>
                        <td style={{ padding: "9px 8px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{inv.quoteNumber}</td>
                        <td style={{ padding: "9px 8px" }}>{inv.clientName || "—"}</td>
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

// ---------- Invoice / Quotation List ----------
function InvoiceList({ title, docTypeFilter, invoices, onOpen, onNew, newLabel, onDelete }) {
  const filtered = invoices.filter((inv) => (inv.docType || "invoice") === docTypeFilter);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>{title}</h1>
        <button onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>
          <Plus size={15} /> {newLabel}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={docTypeFilter === "quotation" ? "No quotations yet" : "No invoices yet"}
          body={docTypeFilter === "quotation" ? "Create a quotation to send an estimate before billing." : "Create your first invoice to start tracking what's owed."}
          action={{ label: newLabel, onClick: onNew }}
        />
      ) : (
        <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                {[docTypeFilter === "quotation" ? "Quote #" : "Invoice #", "Client", "Issued", "Amount", "Status", ""].map((h) => (
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
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${inv.quoteNumber}?`)) onDelete(inv.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 4 }} title="Delete">
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
function SettingsPanel({ settings, updateSettings, showToast }) {
  const [form, setForm] = useState(settings);
  const [logoError, setLogoError] = useState("");
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
  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Business info</h1>
      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 20, background: "#FFFDF9" }}>
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
    </div>
  );
}

// ---------- Clients ----------
function ClientsPanel({ clients, updateClients, showToast }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [editingId, setEditingId] = useState(null);

  function addOrUpdate() {
    if (!form.name.trim()) return;
    if (editingId) {
      updateClients(clients.map((c) => (c.id === editingId ? { ...c, ...form } : c)));
      showToast("Client updated");
    } else {
      updateClients([{ id: uid(), ...form }, ...clients]);
      showToast("Client added");
    }
    setForm({ name: "", email: "", phone: "", address: "" });
    setEditingId(null);
  }
  function edit(c) { setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "" }); setEditingId(c.id); }
  function remove(id) {
    updateClients(clients.filter((c) => c.id !== id));
    if (editingId === id) { setEditingId(null); setForm({ name: "", email: "", phone: "", address: "" }); }
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
              {clients.map((c) => (
                <div key={c.id} style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFDF9" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: "#6E6A5C" }}>{c.phone}{c.phone && c.email ? " · " : ""}{c.email}</div>
                    {c.address && <div style={{ fontSize: 12.5, color: "#8A8574", marginTop: 2 }}>{c.address}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => edit(c)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "6px 10px", fontSize: 12.5 }}>Edit</button>
                    <button onClick={() => { if (confirm(`Remove ${c.name}?`)) remove(c.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 6 }}><Trash2 size={14} /></button>
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

function ItemsPanel({ items, updateItems, showToast }) {
  const [form, setForm] = useState({ code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0 });
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");

  const blank = { code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0 };

  function addOrUpdate() {
    if (!form.desc.trim()) return;
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
  function edit(it) { setForm({ code: it.code || "", desc: it.desc, category: it.category || ITEM_CATEGORIES[0], unit: it.unit || "m2", supplierName: it.supplierName || "", cost: it.cost ?? 0, rate: it.rate ?? 0 }); setEditingId(it.id); }
  function remove(id) {
    updateItems(items.filter((it) => it.id !== id));
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const filtered = filter === "all" ? items : items.filter((it) => it.category === filter);
  const formMargin = marginPct(form.rate, form.cost);
  const formProfit = num(form.rate) - num(form.cost);

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: "0 0 22px 0" }}>Items</h1>
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, padding: 18, background: "#FFFDF9" }}>
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
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
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
          </div>

          {filtered.length === 0 ? (
            <EmptyState title={items.length === 0 ? "No items yet" : "Nothing in this category"} body="Register products or services here so you can add them to invoices with one click." />
          ) : (
            <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: "#F1EDE3", textAlign: "left" }}>
                    {["Category", "Code", "Description", "Supplier", "Unit", "Cost", "Rate", "Margin", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8574", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it, idx) => {
                    const m = marginPct(it.rate, it.cost);
                    return (
                      <tr key={it.id} style={{ borderTop: "1px solid #E4DFD3", background: idx % 2 ? "#FCFAF5" : "#FFFDF9" }}>
                        <td style={{ padding: "11px 14px" }}><CategoryBadge category={it.category} /></td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{it.code || "—"}</td>
                        <td style={{ padding: "11px 14px" }}>{it.desc}</td>
                        <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{it.supplierName || "—"}</td>
                        <td style={{ padding: "11px 14px", color: "#6E6A5C" }}>{ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", color: "#6E6A5C" }}>{money(num(it.cost))}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace" }}>{money(num(it.rate))}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "'IBM Plex Mono', monospace", color: m < 0 ? "#B5482F" : "#3D6B5C", fontWeight: 600 }}>{m.toFixed(1)}%</td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => edit(it)} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>Edit</button>
                            <button onClick={() => { if (confirm(`Remove ${it.desc}?`)) remove(it.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 5 }}><Trash2 size={13} /></button>
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
  const { subtotal, discount, depositAmt, total } = calcTotals(invoice);
  const depositMode = invoice.depositMode || "percent";
  const depositDisplayValue = invoice.depositValue !== undefined && invoice.depositValue !== "" ? invoice.depositValue : (invoice.depositPct ?? 0);

  function setRow(rowId, patch) {
    onChange({ rows: invoice.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) });
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
    onChange({ rows: [...invoice.rows, { id: uid(), kind: "item", desc: "", code: "", w: "", h: "", qty: 1, m2: "", rate: 0 }] });
  }
  function addItemFromCatalog(itemId) {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    onChange({ rows: [...invoice.rows, { id: uid(), kind: "item", desc: it.desc, code: it.code || "", w: "", h: "", qty: 1, m2: "", rate: num(it.rate) }] });
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
      <button onClick={onBack} className="no-print" style={backBtnStyle}><ArrowLeft size={14} /> All invoices</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "14px 0 22px 0" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, margin: 0 }}>Editing {invoice.docType === "quotation" ? "quotation" : "invoice"} {invoice.quoteNumber}</h1>
        <button onClick={onDone} style={{ background: "#1B2A3D", color: "#FAF8F3", border: "none", padding: "9px 18px", borderRadius: 5, fontSize: 13.5, fontWeight: 600 }}>Done</button>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        <div style={{ width: 160 }}><Field label={invoice.docType === "quotation" ? "Quote #" : "Invoice #"}><TextInput value={invoice.quoteNumber} onChange={(e) => onChange({ quoteNumber: e.target.value })} /></Field></div>
        <div style={{ width: 160 }}><Field label="Customer ID"><TextInput value={invoice.customerId} onChange={(e) => onChange({ customerId: e.target.value })} /></Field></div>
        <div style={{ width: 160 }}><Field label="Date"><TextInput type="date" value={invoice.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} /></Field></div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        <div style={{ width: 240 }}>
          <Field label="Client">
            <select value={invoice.clientId || ""} onChange={(e) => pickClient(e.target.value)} style={{ ...inputStyle }}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="To (name)"><TextInput value={invoice.clientName} onChange={(e) => onChange({ clientName: e.target.value })} /></Field></div>
        <div style={{ width: 160 }}><Field label="Phone"><TextInput value={invoice.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} /></Field></div>
      </div>
      <Field label="Address"><TextInput value={invoice.clientAddress} onChange={(e) => onChange({ clientAddress: e.target.value })} /></Field>

      <div style={{ border: "1px solid #E4DFD3", borderRadius: 8, overflow: "hidden", marginTop: 12, marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F1EDE3" }}>
              <th style={{ ...thStyle, width: 40 }}>No</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 100 }}>Code</th>
              <th style={{ ...thStyle, width: 60 }}>W</th>
              <th style={{ ...thStyle, width: 60 }}>H</th>
              <th style={{ ...thStyle, width: 55 }}>Qty</th>
              <th style={{ ...thStyle, width: 65 }}>M²</th>
              <th style={{ ...thStyle, width: 80 }}>Rate/m²</th>
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
                    <td colSpan={9} style={{ padding: "4px 10px" }}>
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
                        <td style={tdStyle}><input value={r.code} onChange={(e) => setRow(r.id, { code: e.target.value })} placeholder="AW101 50mm" style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.w} onChange={(e) => setRowWithM2Suggest(r.id, { w: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.h} onChange={(e) => setRowWithM2Suggest(r.id, { h: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
                        <td style={tdStyle}><input type="number" value={r.qty} onChange={(e) => setRowWithM2Suggest(r.id, { qty: e.target.value })} style={{ ...inputStyle, border: "none", padding: "7px 8px" }} /></td>
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
                    {catItems.map((it) => <option key={it.id} value={it.id}>{it.desc}{it.code ? ` (${it.code})` : ""} — {money(num(it.rate))}</option>)}
                  </optgroup>
                );
              })}
              {items.some((it) => !it.category) && (
                <optgroup label="Uncategorized">
                  {items.filter((it) => !it.category).map((it) => <option key={it.id} value={it.id}>{it.desc}{it.code ? ` (${it.code})` : ""} — {money(num(it.rate))}</option>)}
                </optgroup>
              )}
            </select>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#8A8574", marginBottom: 18 }}>M² auto-fills from W × H × Qty ÷ 10,000 — edit it directly to override.</div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <Field label="Terms & conditions"><textarea value={invoice.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} rows={5} placeholder="(leave blank to use default terms from Business info)" style={{ ...inputStyle, resize: "vertical" }} /></Field>
        </div>
        <div style={{ width: 240 }}>
          <Field label="Discount ($)"><TextInput type="number" value={invoice.discount} onChange={(e) => onChange({ discount: e.target.value })} /></Field>
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
            <Row label={depositMode === "percent" ? `Deposit (${depositDisplayValue || 0}%)` : "Deposit"} value={money(depositAmt)} />
            <Row label="Balance due" value={money(total)} bold />
          </div>
        </div>
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
function InvoiceView({ invoice, settings, onBack, onEdit, onStatus, onDelete, onConvert, onConvertToReceipt }) {
  const { subtotal, discount, depositAmt, total, depositMode, depositValue } = calcTotals(invoice);
  const status = effectiveStatus(invoice);
  const terms = (invoice.notes && invoice.notes.trim()) ? invoice.notes : settings.terms;
  const initials = (settings.businessName || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const isQuote = invoice.docType === "quotation";

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}><ArrowLeft size={14} /> All invoices</button>
        <div style={{ display: "flex", gap: 8 }}>
          {isQuote ? (
            <>
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status !== "accepted" && status !== "declined" && <ActionBtn icon={<Check size={13} />} label="Mark accepted" onClick={() => onStatus("accepted")} />}
              {status !== "declined" && status !== "accepted" && <ActionBtn icon={<X size={13} />} label="Mark declined" onClick={() => onStatus("declined")} />}
              {status === "accepted" && <ActionBtn icon={<FileText size={13} />} label="Convert to invoice" onClick={onConvert} />}
            </>
          ) : (
            <>
              {status !== "paid" && <ActionBtn icon={<Check size={13} />} label="Mark paid" onClick={() => onStatus("paid")} />}
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status === "paid" && <ActionBtn icon={<FileText size={13} />} label="Create receipt" onClick={onConvertToReceipt} />}
            </>
          )}
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={() => window.print()} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={() => { if (confirm(`Delete ${invoice.quoteNumber}?`)) onDelete(); }} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", color: "#B5482F" }}><Trash2 size={13} /></button>
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
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#1B2A3D", letterSpacing: "0.02em" }}>{isQuote ? "QUOTATION" : "INVOICE"}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6E6A5C", marginTop: 6 }}>
              <div>Date: {fmtDate(invoice.issueDate)}</div>
              <div>{isQuote ? "Quote #" : "Invoice #"}: {invoice.quoteNumber}</div>
              {invoice.customerId && <div>Customer ID: {invoice.customerId}</div>}
            </div>
          </div>
        </div>

        <div style={{ borderTop: "2px solid #1B2A3D", borderBottom: "1px solid #E4DFD3", padding: "12px 0", marginBottom: 20, fontSize: 13.5 }}>
          <div><span style={labelInline}>To:</span> <strong>{invoice.clientName || "—"}</strong></div>
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
              <th style={{ ...printTh, textAlign: "right" }}>M²</th>
              <th style={{ ...printTh, textAlign: "right" }}>Rate/m²</th>
              <th style={{ ...printTh, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let n = 0;
              return invoice.rows.map((r) =>
                r.kind === "section" ? (
                  <tr key={r.id}>
                    <td colSpan={9} style={{ background: "#DCE7F0", textAlign: "center", fontWeight: 600, padding: "5px 0", fontSize: 12 }}>{r.label || "—"}</td>
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
            <Row label={depositMode === "percent" ? `Deposit ${depositValue || 0}%` : "Deposit"} value={money(depositAmt)} />
            <div style={{ border: "1px solid #1B2A3D", borderRadius: 4, padding: "6px 10px", display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 700 }}>
              <span>Total</span><span>{money(total)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48 }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ borderBottom: "1px solid #C9C3B0", width: 160, marginBottom: 6, height: 28 }} />
            Buyer
          </div>
          <div style={{ fontSize: 13, textAlign: "center" }}>
            <div style={{ width: 160, marginBottom: 6, height: 28, fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#3D6B5C", borderBottom: "1px solid #C9C3B0" }}>{settings.sellerName}</div>
            Seller
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
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${r.quoteNumber}?`)) onDelete(r.id); }} style={{ background: "none", border: "none", color: "#B5482F", padding: 4 }} title="Delete">
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

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={backBtnStyle}><ArrowLeft size={14} /> All receipts</button>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={() => window.print()} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={() => { if (confirm(`Delete ${receipt.quoteNumber}?`)) onDelete(); }} style={{ background: "none", border: "1px solid #DAD5C6", borderRadius: 5, padding: "7px 10px", color: "#B5482F" }}><Trash2 size={13} /></button>
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