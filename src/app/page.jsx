"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { calcTotals, nextDocNumber, todayISO, uid, num, DEFAULT_SETTINGS, generateDueRecurring, showInPageMessage } from "@/lib/helpers";
// import { calcTotals, nextDocNumber, todayISO, uid, num, DEFAULT_SETTINGS } from "@/lib/helpers";
import { loadAll, saveClients, saveInvoices, saveItems, saveSettings, saveExpenses, saveSchedule, saveTrash } from "@/lib/storage";
import { Sidebar, MobileNav } from "@/components/layout/Sidebar";
import { Toast } from "@/components/layout/Toast";
import { Dashboard } from "@/components/Dashboard";
import { ReportsPanel } from "@/components/ReportsPanel";
import { InvoiceList } from "@/components/InvoiceList";
import { ReceiptList } from "@/components/ReceiptList";
import { ExpensesPanel } from "@/components/ExpensesPanel";
import { ClientsPanel } from "@/components/ClientsPanel";
import { ItemsPanel } from "@/components/ItemsPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { InvoiceView } from "@/components/InvoiceView";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { ReceiptView } from "@/components/ReceiptView";
import { SchedulePanel } from "@/components/SchedulePanel";
import { AuthGate } from "@/components/AuthGate";
import { WarrantyPanel } from "@/components/WarrantyPanel";
import { TrashPanel } from "@/components/TrashPanel";

export default function InvoicingApp() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [view, setView] = useState("dashboard");
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [trash, setTrash] = useState([]);

  // App lock — re-evaluated fresh every time the app loads, never persisted.
  const [unlocked, setUnlocked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadAll().then((data) => {
      setClients(data.clients);
      setInvoices(data.invoices);
      setSettings(data.settings);
      setItems(data.items);
      setExpenses(data.expenses || []);
      setSchedule(data.schedule || []);
      setTrash(data.trash || []);
      // No lock configured (or authMode missing/"none") -> start unlocked.
      // Also treat an incompletely-configured lock (mode set to "pin" but no
      // pinCode saved yet, or "users" with zero accounts) as unlocked — the
      // alternative is AuthGate rendering null with nothing to unlock
      // through, which would strand the person on a permanent blank screen.
      // Otherwise AuthGate takes over until onUnlock fires.
      const mode = data.settings?.authMode;
      const lockIsUsable =
        (mode === "pin" && !!data.settings?.pinCode) ||
        (mode === "users" && (data.settings?.users || []).length > 0);
      setUnlocked(!lockIsUsable);
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  
  // const updateInvoices = useCallback((next) => { setInvoices(next); saveInvoices(next); }, []);
  // const updateClients = useCallback((next) => { setClients(next); saveClients(next); }, []);
  // const updateSettings = useCallback((next) => { setSettings(next); saveSettings(next); }, []);
  // const updateItems = useCallback((next) => { setItems(next); saveItems(next); }, []);
  // const updateExpenses = useCallback((next) => { setExpenses(next); saveExpenses(next); }, []);
  // const updateSchedule = useCallback((next) => { setSchedule(next); saveSchedule(next); }, []);
  // const updateTrash = useCallback((next) => { setTrash(next); saveTrash(next); }, []);

  const warnIfSaveFailed = useCallback((ok) => {
    if (!ok) showInPageMessage("Couldn't save — your last change may not persist. Check your connection and try again, or export a backup from Business info once it's working.");
  }, []);
  const updateInvoices = useCallback((next) => { setInvoices(next); saveInvoices(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateClients = useCallback((next) => { setClients(next); saveClients(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateSettings = useCallback((next) => { setSettings(next); saveSettings(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateItems = useCallback((next) => { setItems(next); saveItems(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateExpenses = useCallback((next) => { setExpenses(next); saveExpenses(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateSchedule = useCallback((next) => { setSchedule(next); saveSchedule(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);
  const updateTrash = useCallback((next) => { setTrash(next); saveTrash(next).then(warnIfSaveFailed); }, [warnIfSaveFailed]);

  // Shared entry point for "delete" across every panel: stash a copy of the
  // deleted thing in trash (with enough info to restore it) rather than
  // losing it outright. `type` matches TRASH_TYPE_LABELS in TrashPanel.
  const moveToTrash = useCallback((type, label, data) => {
    const entry = { id: uid(), type, label, deletedAt: new Date().toISOString(), data };
    setTrash((t) => {
      const next = [entry, ...t];
      saveTrash(next);
      return next;
    });
  }, []);

  const handleUnlock = useCallback((user) => {
    setCurrentUser(user);
    setUnlocked(true);
  }, []);

  const handleDisablePin = useCallback(() => {
    const next = { ...settings, authMode: "none", pinCode: "" };
    updateSettings(next);
    setUnlocked(true);
  }, [settings, updateSettings]);

  const handleDisableUsers = useCallback(() => {
    const next = { ...settings, authMode: "none" };
    updateSettings(next);
    setUnlocked(true);
  }, [settings, updateSettings]);

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
        // POs don't default to the first client — a PO's "client" is a
        // supplier, and pre-filling a real client's name there would be
        // actively wrong, not just unhelpful.
        clientId: docType === "po" ? null : (clients[0]?.id || null),
        clientName: docType === "po" ? "" : (clients[0]?.name || ""),
        clientAddress: docType === "po" ? "" : (clients[0]?.address || ""),
        clientPhone: docType === "po" ? "" : (clients[0]?.phone || ""),
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

  // Shifts item stock up or down by a document's rows. sign=-1 deducts
  // (an invoice went out the door), sign=+1 restores/adds (a PO came in,
  // or a deduction is being undone on delete). Matching is by code first,
  // falling back to description, since that's the best link we have
  // between a free-text invoice row and a catalog item.
  function adjustStock(doc, sign) {
    const updates = {};
    (doc.rows || []).filter((r) => r.kind === "item").forEach((r) => {
      const match = items.find((it) => {
        if (r.code && it.code) return it.code.trim().toLowerCase() === r.code.trim().toLowerCase();
        return (it.desc || "").trim().toLowerCase() === (r.desc || "").trim().toLowerCase();
      });
      if (!match) return;
      const qty = num(r.m2) > 0 ? num(r.m2) : num(r.qty);
      updates[match.id] = (updates[match.id] !== undefined ? updates[match.id] : num(match.stock)) + sign * qty;
    });
    if (Object.keys(updates).length === 0) return false;
    updateItems(items.map((it) => (updates[it.id] !== undefined ? { ...it, stock: +updates[it.id].toFixed(2) } : it)));
    return true;
  }

  function deleteInvoice(id) {
    const doc = invoices.find((i) => i.id === id);
    // Undo a stock deduction if this invoice already took stock out, so
    // deleting it doesn't leave inventory permanently short.
    if (doc && doc.docType === "invoice" && doc.stockDeducted) {
      adjustStock(doc, 1);
    }
    if (doc) moveToTrash(doc.docType || "invoice", doc.clientName || doc.quoteNumber, doc);
    updateInvoices(invoices.filter((i) => i.id !== id));
    if (activeInvoiceId === id) {
      const dt = doc?.docType;
      setView(dt === "quotation" ? "quotations" : dt === "receipt" ? "receipts" : dt === "po" ? "purchase-orders" : "invoices");
    }
  }
  function patchInvoice(id, patch) {
    updateInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  // Status changes carry inventory side effects: an invoice leaving draft
  // deducts stock (once — stockDeducted guards against double-deducting on
  // repeated status changes), and a PO marked "received" adds stock back in.
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

  const totalsSummary = useMemo(() => {
    let outstanding = 0, paid = 0;
    invoices.filter((inv) => (inv.docType || "invoice") === "invoice").forEach((inv) => {
      const { total } = calcTotals(inv);
      if (inv.status === "paid") paid += total;
      else outstanding += total;
    });
    return { outstanding, paid };
  }, [invoices]);

  function goTo(nextView, invoiceId = null) {
    setActiveInvoiceId(invoiceId);
    setView(nextView);
  }

  // Restores a trashed entry back into its own list (clients/items/schedule/
  // invoices) and removes it from trash. If its origin list has since changed
  // shape in a way that would make the restored copy invalid, this still puts
  // it back as-is — the user can edit it after restoring.
  function restoreFromTrash(id) {
    const entry = trash.find((t) => t.id === id);
    if (!entry) return;
    if (entry.type === "client") updateClients([entry.data, ...clients]);
    else if (entry.type === "item") updateItems([entry.data, ...items]);
    else if (entry.type === "schedule") updateSchedule([entry.data, ...schedule]);
    else if (["invoice", "quotation", "receipt", "po"].includes(entry.type)) updateInvoices([entry.data, ...invoices]);
    updateTrash(trash.filter((t) => t.id !== id));
    showToast("Restored");
  }

  function deleteForever(id) {
    updateTrash(trash.filter((t) => t.id !== id));
  }

  function emptyTrash() {
    updateTrash([]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
        <div className="font-mono text-[#8A8574] text-[13px]">Loading ledger…</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <AuthGate
        settings={settings}
        unlocked={unlocked}
        onUnlock={handleUnlock}
        onDisablePin={handleDisablePin}
        onDisableUsers={handleDisableUsers}
      />
    );
  }

  return (
    <div className="app-shell flex flex-col lg:flex-row h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
      <Sidebar view={view} setView={setView} totalsSummary={totalsSummary} />
      <MobileNav view={view} setView={setView} totalsSummary={totalsSummary} open={mobileNavOpen} setOpen={setMobileNavOpen} />

      <div className="app-main flex-1 overflow-auto px-4 py-6 sm:px-6 sm:py-7 lg:px-9">
        {view === "dashboard" && (
          <Dashboard
            invoices={invoices}
            expenses={expenses}
            onOpen={(id) => goTo("invoice-view", id)}
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
            onOpen={(id) => goTo("invoice-view", id)}
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
            onOpen={(id) => goTo("invoice-view", id)}
            onNew={() => createDoc("quotation")}
            newLabel="New quotation"
            onDelete={deleteInvoice}
          />
        )}
        {view === "receipts" && (
          <ReceiptList
            invoices={invoices}
            onOpen={(id) => goTo("invoice-view", id)}
            onNew={() => createDoc("receipt")}
            onDelete={deleteInvoice}
          />
        )}
        {view === "purchase-orders" && (
          <InvoiceList
            title="Purchase Orders"
            docTypeFilter="po"
            invoices={invoices}
            onOpen={(id) => goTo("invoice-view", id)}
            onNew={() => createDoc("po")}
            newLabel="New purchase order"
            onDelete={deleteInvoice}
          />
        )}
        {view === "expenses" && (
          <ExpensesPanel
            expenses={expenses}
            updateExpenses={updateExpenses}
            showToast={showToast}
            purchaseOrders={invoices.filter((i) => i.docType === "po")}
            onLinkPO={(poId) => handleStatusChange(poId, "paid")}
          />
        )}
        {view === "clients" && <ClientsPanel clients={clients} updateClients={updateClients} showToast={showToast} />}
        {view === "items" && <ItemsPanel items={items} updateItems={updateItems} showToast={showToast} />}
        {view === "settings" && <SettingsPanel settings={settings} updateSettings={updateSettings} showToast={showToast} />}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptEditor receipt={activeInvoice} clients={clients} onChange={(patch) => patchInvoice(activeInvoice.id, patch)} onDone={() => setView("invoice-view")} onBack={() => setView("receipts")} />
        )}
        {view === "invoice-edit" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceEditor
            invoice={activeInvoice}
            clients={clients}
            items={items}
            onChange={(patch) => patchInvoice(activeInvoice.id, patch)}
            onDone={() => setView("invoice-view")}
            onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : activeInvoice.docType === "po" ? "purchase-orders" : "invoices")}
          />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType === "receipt" && (
          <ReceiptView receipt={activeInvoice} settings={settings} onBack={() => setView("receipts")} onEdit={() => setView("invoice-edit")} onDelete={() => deleteInvoice(activeInvoice.id)} />
        )}
        {view === "invoice-view" && activeInvoice && activeInvoice.docType !== "receipt" && (
          <InvoiceView
            invoice={activeInvoice}
            settings={settings}
            onBack={() => setView(activeInvoice.docType === "quotation" ? "quotations" : activeInvoice.docType === "po" ? "purchase-orders" : "invoices")}
            onEdit={() => setView("invoice-edit")}
            onStatus={(status) => handleStatusChange(activeInvoice.id, status)}
            onDelete={() => deleteInvoice(activeInvoice.id)}
            onConvert={() => convertToInvoice(activeInvoice.id)}
            onConvertToReceipt={() => convertToReceipt(activeInvoice.id)}
          />
        )}
        {view === "schedule" && (
          <SchedulePanel
            schedule={schedule}
            updateSchedule={updateSchedule}
            clients={clients}
            showToast={showToast}
            onTrash={(label, item) => moveToTrash("schedule", label, item)}
          />
        )}
        {view === "warranty" && <WarrantyPanel invoices={invoices} items={items} />}

        {view === "trash" && (
          <TrashPanel
            trash={trash}
            onRestore={restoreFromTrash}
            onDeleteForever={deleteForever}
            onEmptyTrash={emptyTrash}
          />
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}