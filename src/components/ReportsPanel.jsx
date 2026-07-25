"use client";

import React, { useState, useMemo } from "react";
import { Download, Printer, FileText, TrendingUp, AlertTriangle, Percent, Receipt, Truck } from "lucide-react";
import { calcTotals, effectiveStatus, fmtDate, todayISO, money, num } from "@/lib/helpers";
import { Field, TextInput, KpiCard, ActionBtn, panelTitleClass } from "@/components/ui/Primitives";

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

export function ReportsPanel({ invoices, expenses, settings }) {
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
      <div className="no-print flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-4.5">
        <h1 className="font-display text-[28px] font-semibold m-0">Reports</h1>
        <div className="flex gap-2 flex-wrap">
          <ActionBtn icon={<Download size={13} />} label="Export CSV" onClick={exportCsv} />
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={() => window.print()} />
        </div>
      </div>

      <div className="no-print flex items-end gap-3.5 mb-2.5 flex-wrap">
        <div className="w-full sm:w-40"><Field label="From"><TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field></div>
        <div className="w-full sm:w-40"><Field label="To"><TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field></div>
        <div className="flex gap-1 mb-3.5 flex-wrap">
          {[["thisMonth", "This month"], ["lastMonth", "Last month"], ["thisYear", "This year"], ["allTime", "All time"]].map(([key, label]) => (
            <button key={key} onClick={() => setPreset(key)} className="bg-transparent border border-[#DAD5C6] text-[#6E6A5C] rounded-md px-3 py-2 text-[12.5px] font-semibold">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="print-sheet bg-[#FFFDF9] border border-[#E4DFD3] rounded-[10px] px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-2 mb-5 border-b-2 border-[#1B2A3D] pb-3">
          <div>
            <div className="font-display text-xl font-bold">{settings.businessName}</div>
            <div className="text-xs text-[#8A8574]">Financial report</div>
          </div>
          <div className="font-mono text-[12.5px] text-[#6E6A5C]">{rangeLabel}</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4.5">
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
          <div className="mb-5.5">
            <div className={panelTitleClass}>Expenses by category</div>
            <div className="flex flex-col gap-2">
              {Object.entries(data.expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                const max = Math.max(...Object.values(data.expenseByCategory));
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span>{cat}</span>
                      <span className="font-mono">{money(amt)}</span>
                    </div>
                    <div className="h-1.5 bg-[#EDEAE2] rounded-full overflow-hidden">
                      <div className="h-full bg-[#B5482F]" style={{ width: `${Math.max((amt / max) * 100, 4)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={panelTitleClass}>Transactions ({data.transactions.length})</div>
        {data.transactions.length === 0 ? (
          <div className="text-sm text-[#8A8574]">No activity in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px] min-w-[520px]">
              <thead>
                <tr className="border-b-2 border-[#1B2A3D] text-left">
                  {["Date", "Type", "Number", "Party", "Amount"].map((h) => (
                    <th key={h} className="font-mono text-[10px] tracking-[0.04em] uppercase text-[#8A8574] px-2 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.type + t.id} className="border-b border-[#EDEAE2]">
                    <td className="text-[#6E6A5C] px-2 py-1.5">{fmtDate(t.date)}</td>
                    <td className="px-2 py-1.5">{t.type}</td>
                    <td className="font-mono px-2 py-1.5">{t.number}</td>
                    <td className="px-2 py-1.5">{t.party}</td>
                    <td className={`font-mono text-right px-2 py-1.5 ${t.amount < 0 ? "text-[#B5482F]" : "text-[#1B2A3D]"}`}>{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
