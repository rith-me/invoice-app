"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { calcTotals, nextDocNumber, todayISO, uid, DEFAULT_SETTINGS } from "@/lib/helpers";
import { loadAll, saveClients, saveInvoices, saveItems, saveSettings } from "@/lib/storage";
import { Sidebar, MobileNav } from "@/components/layout/Sidebar";
import { Toast } from "@/components/layout/Toast";
import { Dashboard } from "@/components/Dashboard";
import { InvoiceList } from "@/components/InvoiceList";
import { ReceiptList } from "@/components/ReceiptList";
import { ClientsPanel } from "@/components/ClientsPanel";
import { ItemsPanel } from "@/components/ItemsPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { InvoiceView } from "@/components/InvoiceView";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { ReceiptView } from "@/components/ReceiptView";

export default function InvoicingApp() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [items, setItems] = useState([]);
  const [view, setView] = useState("dashboard");
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  function goTo(nextView, invoiceId = null) {
    setActiveInvoiceId(invoiceId);
    setView(nextView);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
        <div className="font-mono text-[#8A8574] text-[13px]">Loading ledger…</div>
      </div>
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
            onOpen={(id) => goTo("invoice-view", id)}
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

      <Toast message={toast} />
    </div>
  );
  
}
