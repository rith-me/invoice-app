"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { calcTotals, effectiveStatus, fmtDate, money } from "@/lib/helpers";
import { Badge, EmptyState } from "@/components/ui/Primitives";

export function InvoiceList({ title, docTypeFilter, invoices, onOpen, onNew, newLabel, onDelete }) {
  const filtered = invoices.filter((inv) => (inv.docType || "invoice") === docTypeFilter);
  const headers = [docTypeFilter === "quotation" ? "Quote #" : "Invoice #", "Client", "Issued", "Amount", "Status", ""];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-5">
        <h1 className="font-display text-[28px] font-semibold m-0">{title}</h1>
        <button onClick={onNew} className="self-start flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold">
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
        <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px] min-w-[600px]">
              <thead>
                <tr className="bg-[#F1EDE3] text-left">
                  {headers.map((h) => (
                    <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, idx) => {
                  const { total } = calcTotals(inv);
                  const status = effectiveStatus(inv);
                  return (
                    <tr key={inv.id} onClick={() => onOpen(inv.id)} className={`border-t border-[#E4DFD3] cursor-pointer ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                      <td className="font-mono font-semibold px-3.5 py-2.5">{inv.quoteNumber}</td>
                      <td className="px-3.5 py-2.5">{inv.clientName || "—"}</td>
                      <td className="text-[#6E6A5C] px-3.5 py-2.5">{fmtDate(inv.issueDate)}</td>
                      <td className="font-mono px-3.5 py-2.5">{money(total)}</td>
                      <td className="px-3.5 py-2.5"><Badge status={status} /></td>
                      <td className="text-right px-3.5 py-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${inv.quoteNumber}?`)) onDelete(inv.id); }}
                          className="bg-transparent border-none text-[#B5482F] p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
