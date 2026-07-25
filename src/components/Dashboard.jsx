"use client";

import React, { useMemo } from "react";
import { Plus, FileText, TrendingUp, AlertTriangle, Percent, Receipt } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { calcTotals, effectiveStatus, money, num, monthKey, monthLabel, lastNMonthKeys, STATUS } from "@/lib/helpers";
import { Badge, KpiCard, EmptyState, panelTitleClass } from "@/components/ui/Primitives";

export function Dashboard({ invoices, expenses, onOpen, onNewInvoice, onNewQuotation, onNewReceipt }) {
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

    const totalExpenses = (expenses || []).reduce((s, e) => s + num(e.amount), 0);

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
      (expenses || []).forEach((e) => { if (monthKey(e.date) === key) spent += num(e.amount); });
      return { month: monthLabel(key), Invoiced: +invoiced.toFixed(2), Collected: +collected.toFixed(2), Expenses: +spent.toFixed(2) };
    });

    const pieData = Object.entries(statusAmounts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: STATUS[key]?.label || key, value: +value.toFixed(2), color: STATUS[key]?.color || "#999" }));

    const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recent = [...invoices]
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""))
      .slice(0, 6);

    const totalReceipted = receiptsOnly.reduce((s, r) => s + num(r.amountReceived), 0);
    const netProfit = totalPaid - totalExpenses;

    return { totalPaid, totalOutstanding, totalOverdue, quoteOpenValue, acceptRate, quoteCount: quotesOnly.length, monthData, pieData, topClients, recent, totalReceipted, receiptCount: receiptsOnly.length, totalExpenses, netProfit };
  }, [invoices, expenses]);

  const hasData = invoices.length > 0 || (expenses || []).length > 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-5">
        <h1 className="font-display text-[28px] font-semibold m-0">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={onNewQuotation} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] text-[#1B2A3D] px-4 py-2 rounded-md text-[13.5px] font-semibold">
            <Plus size={15} /> New quotation
          </button>
          <button onClick={onNewReceipt} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] text-[#1B2A3D] px-4 py-2 rounded-md text-[13.5px] font-semibold">
            <Plus size={15} /> New receipt
          </button>
          <button onClick={onNewInvoice} className="flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold">
            <Plus size={15} /> New invoice
          </button>
        </div>
      </div>

      {!hasData ? (
        <EmptyState title="Nothing to report yet" body="Create an invoice or quotation and your numbers will show up here." action={{ label: "New invoice", onClick: onNewInvoice }} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <KpiCard icon={<Receipt size={15} />} label="Total expenses" value={money(data.totalExpenses)} sub={`${(expenses || []).length} expense${(expenses || []).length === 1 ? "" : "s"} logged`} tone="#B5482F" />
            <KpiCard icon={<TrendingUp size={15} />} label="Net profit (paid − expenses)" value={money(data.netProfit)} tone={data.netProfit < 0 ? "#B5482F" : "#3D6B5C"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
            <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
              <div className={panelTitleClass}>Revenue &amp; expenses, last 6 months</div>
              <div className="h-[220px]">
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

            <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
              <div className={panelTitleClass}>Invoice status mix</div>
              {data.pieData.length === 0 ? (
                <div className="text-sm text-[#8A8574] py-5">No invoices yet.</div>
              ) : (
                <div className="h-[220px]">
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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
            <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
              <div className={panelTitleClass}>Top clients</div>
              {data.topClients.length === 0 ? (
                <div className="text-sm text-[#8A8574]">No invoiced clients yet.</div>
              ) : (
                <div className="flex flex-col gap-2.5 mt-1.5">
                  {data.topClients.map(([name, amt]) => {
                    const max = data.topClients[0][1] || 1;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{name}</span>
                          <span className="font-mono">{money(amt)}</span>
                        </div>
                        <div className="h-1.5 bg-[#EDEAE2] rounded-full overflow-hidden">
                          <div className="h-full bg-[#3D6B5C]" style={{ width: `${Math.max((amt / max) * 100, 4)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
              <div className={`${panelTitleClass} px-4 pt-3.5 pb-2`}>Recent documents</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px] min-w-[480px]">
                  <tbody>
                    {data.recent.map((inv) => {
                      const isReceipt = inv.docType === "receipt";
                      const isQuote = inv.docType === "quotation";
                      const isPO = inv.docType === "po";
                      const amount = isReceipt ? num(inv.amountReceived) : calcTotals(inv).total;
                      const status = isReceipt ? null : effectiveStatus(inv);
                      const typeLabel = isReceipt ? "RCPT" : isQuote ? "QUOTE" : isPO ? "PO" : "INV";
                      const typeColor = isReceipt ? "#1B2A3D" : isQuote ? "#8A6D3D" : isPO ? "#6E6A5C" : "#3D6B5C";
                      return (
                        <tr key={inv.id} onClick={() => onOpen(inv.id)} className="border-t border-[#E4DFD3] cursor-pointer">
                          <td className="font-mono text-[10.5px] font-semibold whitespace-nowrap py-2.5 px-4" style={{ color: typeColor }}>{typeLabel}</td>
                          <td className="font-mono font-semibold py-2.5 px-2">{inv.quoteNumber}</td>
                          <td className="py-2.5 px-2">{inv.clientName || "—"}</td>
                          <td className="font-mono text-right py-2.5 px-2">{money(amount)}</td>
                          <td className="text-right py-2.5 px-4">{status ? <Badge status={status} /> : <span className="text-[11px] text-[#8A8574]">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}