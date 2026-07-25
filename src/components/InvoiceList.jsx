"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { calcTotals, effectiveStatus, fmtDate, money } from "@/lib/helpers";
import { Badge, EmptyState, TextInput } from "@/components/ui/Primitives";

export function InvoiceList({ title, docTypeFilter, invoices, onOpen, onNew, newLabel, onDelete }) {
  const [search, setSearch] = useState("");
  const isPO = docTypeFilter === "po";
  const byType = invoices.filter((inv) => (inv.docType || "invoice") === docTypeFilter);
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? byType
    : byType.filter((inv) => {
        if ((inv.quoteNumber || "").toLowerCase().includes(q)) return true;
        if ((inv.clientName || "").toLowerCase().includes(q)) return true;
        return (inv.rows || []).some((r) => (r.desc || "").toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q));
      });

  const numberHeader = docTypeFilter === "quotation" ? "Quote #" : isPO ? "PO #" : "Invoice #";
  const partyHeader = isPO ? "Supplier" : "Client";
  const headers = [numberHeader, partyHeader, "Issued", "Amount", "Status", ""];

  const emptyTitle = q ? "No matches" : docTypeFilter === "quotation" ? "No quotations yet" : isPO ? "No purchase orders yet" : "No invoices yet";
  const emptyBody = q
    ? "Try a different search term."
    : docTypeFilter === "quotation"
    ? "Create a quotation to send an estimate before billing."
    : isPO
    ? "Create a purchase order to request materials or stock from a supplier."
    : "Create your first invoice to start tracking what's owed.";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-4">
        <h1 className="font-display text-[28px] font-semibold m-0">{title}</h1>
        <button onClick={onNew} className="self-start flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold">
          <Plus size={15} /> {newLabel}
        </button>
      </div>

      {byType.length > 0 && (
        <div className="mb-4">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isPO ? "Search by PO #, supplier, code, or item…" : "Search by number, client, code, or item…"}
            className="max-w-[340px]"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} action={q ? undefined : { label: newLabel, onClick: onNew }} />
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