"use client";

import React, { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/helpers";
import { EmptyState } from "@/components/ui/Primitives";

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

export function TrashPanel({ trash, onRestore, onDeleteForever, onEmptyTrash }) {
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const sorted = [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="font-display text-[28px] font-semibold m-0">Trash</h1>
        {trash.length > 0 && !confirmingEmpty && (
          <button onClick={() => setConfirmingEmpty(true)} className="bg-transparent border border-[#DAD5C6] text-[#B5482F] rounded-md px-3.5 py-2 text-[13px] font-semibold">
            Empty trash
          </button>
        )}
      </div>
      <div className="text-[12.5px] text-[#8A8574] mb-4.5">Deleted items are kept here for 30 days before being removed automatically.</div>

      {confirmingEmpty && (
        <div className="flex items-center justify-between bg-[#F5E4DE] border border-[#E3B8A8] rounded-md px-3.5 py-2.5 mb-3.5">
          <span className="text-[12.5px] text-[#8A3A22]">Permanently delete all {trash.length} item{trash.length === 1 ? "" : "s"} in trash? This cannot be undone.</span>
          <div className="flex gap-2 shrink-0 ml-2.5">
            <button onClick={() => setConfirmingEmpty(false)} className="bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px]">Cancel</button>
            <button onClick={() => { onEmptyTrash(); setConfirmingEmpty(false); }} className="bg-[#B5482F] text-[#FAF8F3] border-none rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold">Yes, empty trash</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="Trash is empty" body="Anything you delete from clients, items, expenses, schedule, or documents shows up here first." />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => (
            <div key={t.id} className="border border-[#E4DFD3] rounded-lg px-4 py-3 flex justify-between items-center gap-3 bg-[#FFFDF9] flex-wrap">
              <div className="min-w-0">
                <span className="font-mono text-[10px] tracking-[0.05em] uppercase text-[#8A8574] bg-[#EDEAE2] px-1.5 py-[2px] rounded-sm mr-2">{TRASH_TYPE_LABELS[t.type] || t.type}</span>
                <span className="text-[13.5px]">{t.label}</span>
                <div className="text-[11.5px] text-[#8A8574] mt-0.5">Deleted {fmtDate(t.deletedAt.slice(0, 10))}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onRestore(t.id)} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1B2A3D]">
                  <RotateCcw size={13} /> Restore
                </button>
                <button onClick={() => { if (confirm("Permanently delete this? This can't be undone.")) onDeleteForever(t.id); }} className="bg-transparent border-none text-[#B5482F] p-1.5">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
