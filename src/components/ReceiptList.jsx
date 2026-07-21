"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { fmtDate, money, num } from "@/lib/helpers";
import { EmptyState } from "@/components/ui/Primitives";

export function ReceiptList({ invoices, onOpen, onNew, onDelete }) {
  const receipts = invoices.filter((i) => i.docType === "receipt");
  const headers = ["Receipt #", "Client", "For invoice", "Date", "Amount received", "Method", ""];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-5">
        <h1 className="font-display text-[28px] font-semibold m-0">Receipts</h1>
        <button onClick={onNew} className="self-start flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold">
          <Plus size={15} /> New receipt
        </button>
      </div>

      {receipts.length === 0 ? (
        <EmptyState title="No receipts yet" body="Issue a receipt for a payment you've received, or create one from a paid invoice." action={{ label: "New receipt", onClick: onNew }} />
      ) : (
        <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px] min-w-[640px]">
              <thead>
                <tr className="bg-[#F1EDE3] text-left">
                  {headers.map((h) => (
                    <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map((r, idx) => (
                  <tr key={r.id} onClick={() => onOpen(r.id)} className={`border-t border-[#E4DFD3] cursor-pointer ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                    <td className="font-mono font-semibold px-3.5 py-2.5">{r.quoteNumber}</td>
                    <td className="px-3.5 py-2.5">{r.clientName || "—"}</td>
                    <td className="text-[#6E6A5C] px-3.5 py-2.5">{r.invoiceRef || "—"}</td>
                    <td className="text-[#6E6A5C] px-3.5 py-2.5">{fmtDate(r.issueDate)}</td>
                    <td className="font-mono px-3.5 py-2.5">{money(num(r.amountReceived))}</td>
                    <td className="text-[#6E6A5C] px-3.5 py-2.5">{r.paymentMethod}</td>
                    <td className="text-right px-3.5 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${r.quoteNumber}?`)) onDelete(r.id); }}
                        className="bg-transparent border-none text-[#B5482F] p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
