"use client";

import React, { useState, useMemo } from "react";
import { addMonths, fmtDate, num, todayISO } from "@/lib/helpers";
import { EmptyState, TextInput } from "@/components/ui/Primitives";

export function WarrantyPanel({ invoices, items }) {
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
      <h1 className="font-display text-[28px] font-semibold mb-1.5">Warranty</h1>
      <div className="text-[12.5px] text-[#8A8574] mb-4.5">Tracked automatically from invoiced items that have a warranty period set in your Items catalog.</div>

      <div className="mb-3 max-w-[360px]">
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by client, item, code, or invoice #…" />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {[["all", `All (${rows.length})`], ["active", `Active (${activeCount})`], ["expired", `Expired (${rows.length - activeCount})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`border-none rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${filter === key ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-transparent text-[#6E6A5C]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No warranties tracked yet" : "No matches"}
          body={rows.length === 0 ? "Set a warranty period (months) on items in your catalog, and it'll show up here once invoiced." : "Try a different search or filter."}
        />
      ) : (
        <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px] min-w-[720px]">
              <thead>
                <tr className="bg-[#F1EDE3] text-left">
                  {["Client", "Item", "Invoice #", "Issued", "Warranty", "Expires", "Status"].map((h) => (
                    <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} className={`border-t border-[#E4DFD3] ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                    <td className="px-3.5 py-2.5">{r.client}</td>
                    <td className="px-3.5 py-2.5">{r.item}{r.code ? ` (${r.code})` : ""}</td>
                    <td className="font-mono px-3.5 py-2.5">{r.invoiceNumber}</td>
                    <td className="text-[#6E6A5C] px-3.5 py-2.5">{fmtDate(r.issueDate)}</td>
                    <td className="text-[#6E6A5C] px-3.5 py-2.5">{r.months} mo</td>
                    <td className="font-mono px-3.5 py-2.5">{fmtDate(r.expiry)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`font-mono text-[10.5px] tracking-[0.05em] uppercase px-2 py-[3px] rounded-[3px] font-semibold ${r.active ? "text-[#3D6B5C] bg-[#E3EDE8]" : "text-[#B5482F] bg-[#F5E4DE]"}`}>
                        {r.active ? "Active" : "Expired"}
                      </span>
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
