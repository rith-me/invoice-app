"use client";

import React from "react";
import { ArrowLeft, X, Plus, Rows3 } from "lucide-react";
import { uid, num, money, rowAmount, suggestM2, calcTotals, ITEM_CATEGORIES } from "@/lib/helpers";
import { Field, TextInput, Row, inputClass, backBtnClass } from "@/components/ui/Primitives";

const thClass = "px-2 py-2 text-left font-mono text-[9.5px] tracking-[0.04em] uppercase text-[#8A8574] font-semibold whitespace-nowrap";

export function InvoiceEditor({ invoice, clients, items, onChange, onDone, onBack }) {
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
    <div className="max-w-[860px]">
      <button onClick={onBack} className={`no-print ${backBtnClass}`}><ArrowLeft size={14} /> All invoices</button>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-3 my-3.5 mb-5">
        <h1 className="font-display text-2xl font-semibold m-0">Editing {invoice.docType === "quotation" ? "quotation" : "invoice"} {invoice.quoteNumber}</h1>
        <button onClick={onDone} className="self-start bg-[#1B2A3D] text-[#FAF8F3] border-none px-4.5 py-2 rounded-md text-[13.5px] font-semibold">Done</button>
      </div>

      <div className="flex flex-wrap gap-4 mb-2.5">
        <div className="w-full sm:w-40"><Field label={invoice.docType === "quotation" ? "Quote #" : "Invoice #"}><TextInput value={invoice.quoteNumber} onChange={(e) => onChange({ quoteNumber: e.target.value })} /></Field></div>
        <div className="w-full sm:w-40"><Field label="Customer ID"><TextInput value={invoice.customerId} onChange={(e) => onChange({ customerId: e.target.value })} /></Field></div>
        <div className="w-full sm:w-40"><Field label="Date"><TextInput type="date" value={invoice.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} /></Field></div>
      </div>

      <div className="flex flex-wrap gap-4 mb-4.5">
        <div className="w-full sm:w-60">
          <Field label="Client">
            <select value={invoice.clientId || ""} onChange={(e) => pickClient(e.target.value)} className={inputClass}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex-1 min-w-[200px]"><Field label="To (name)"><TextInput value={invoice.clientName} onChange={(e) => onChange({ clientName: e.target.value })} /></Field></div>
        <div className="w-full sm:w-40"><Field label="Phone"><TextInput value={invoice.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} /></Field></div>
      </div>
      <Field label="Address"><TextInput value={invoice.clientAddress} onChange={(e) => onChange({ clientAddress: e.target.value })} /></Field>

      <div className="border border-[#E4DFD3] rounded-lg overflow-hidden mt-3 mb-3">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] min-w-[720px]">
            <thead>
              <tr className="bg-[#F1EDE3]">
                <th className={`${thClass} w-10`}>No</th>
                <th className={thClass}>Description</th>
                <th className={`${thClass} w-[100px]`}>Code</th>
                <th className={`${thClass} w-[60px]`}>W</th>
                <th className={`${thClass} w-[60px]`}>H</th>
                <th className={`${thClass} w-[55px]`}>Qty</th>
                <th className={`${thClass} w-[65px]`}>M²</th>
                <th className={`${thClass} w-20`}>Rate/m²</th>
                <th className={`${thClass} w-[90px]`}>Amount</th>
                <th className={`${thClass} w-8`}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return invoice.rows.map((r) =>
                  r.kind === "section" ? (
                    <tr key={r.id} className="border-t border-[#E4DFD3] bg-[#EAF0F5]">
                      <td colSpan={9} className="px-2.5 py-1">
                        <input
                          value={r.label}
                          onChange={(e) => setRow(r.id, { label: e.target.value })}
                          placeholder="Section label (e.g. Ground floor)"
                          className={`${inputClass} border-none bg-transparent font-semibold text-center py-1`}
                        />
                      </td>
                      <td className="py-0.5"><button onClick={() => removeRow(r.id)} className="bg-transparent border-none text-[#B5482F]"><X size={14} /></button></td>
                    </tr>
                  ) : (
                    (() => {
                      n += 1;
                      return (
                        <tr key={r.id} className="border-t border-[#E4DFD3]">
                          <td className="font-mono text-[#8A8574] text-center py-1.5 px-2">{n}</td>
                          <td className="py-0.5"><input value={r.desc} onChange={(e) => setRow(r.id, { desc: e.target.value })} placeholder="Wooden Blinds" className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input value={r.code} onChange={(e) => setRow(r.id, { code: e.target.value })} placeholder="AW101 50mm" className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input type="number" value={r.w} onChange={(e) => setRowWithM2Suggest(r.id, { w: e.target.value })} className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input type="number" value={r.h} onChange={(e) => setRowWithM2Suggest(r.id, { h: e.target.value })} className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input type="number" value={r.qty} onChange={(e) => setRowWithM2Suggest(r.id, { qty: e.target.value })} className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input type="number" value={r.m2} onChange={(e) => setRow(r.id, { m2: e.target.value })} className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="py-0.5"><input type="number" value={r.rate} onChange={(e) => setRow(r.id, { rate: e.target.value })} className={`${inputClass} border-none py-1.5 px-2`} /></td>
                          <td className="font-mono py-1.5 px-2">{money(rowAmount(r))}</td>
                          <td className="py-0.5"><button onClick={() => removeRow(r.id)} className="bg-transparent border-none text-[#B5482F]"><X size={14} /></button></td>
                        </tr>
                      );
                    })()
                  )
                );
              })()}
            </tbody>
          </table>
        </div>
        <div className="p-2.5 border-t border-[#E4DFD3] flex gap-4 items-center flex-wrap">
          <button onClick={addItem} className="flex items-center gap-1.5 bg-transparent border-none text-[#3D6B5C] text-[13px] font-semibold"><Plus size={14} /> Add item</button>
          <button onClick={addSection} className="flex items-center gap-1.5 bg-transparent border-none text-[#6E6A5C] text-[13px] font-semibold"><Rows3 size={14} /> Add section divider</button>
          {items.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) addItemFromCatalog(e.target.value); e.target.value = ""; }}
              className={`${inputClass} w-auto px-2.5 py-1.5 text-[12.5px] text-[#8A6D3D]`}
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
      <div className="text-xs text-[#8A8574] mb-4.5">M² auto-fills from W × H × Qty ÷ 10,000 — edit it directly to override.</div>

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1">
          <Field label="Terms & conditions"><textarea value={invoice.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} rows={5} placeholder="(leave blank to use default terms from Business info)" className={`${inputClass} resize-y`} /></Field>
        </div>
        <div className="w-full lg:w-60">
          <Field label="Discount ($)"><TextInput type="number" value={invoice.discount} onChange={(e) => onChange({ discount: e.target.value })} /></Field>
          <Field label="Deposit">
            <div className="flex gap-1.5">
              <div className="flex border border-[#DAD5C6] rounded overflow-hidden shrink-0">
                <button
                  onClick={() => onChange({ depositMode: "percent" })}
                  className={`px-2.5 py-2 text-[13px] font-semibold border-none ${depositMode === "percent" ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-[#FFFDF9] text-[#6E6A5C]"}`}
                >
                  %
                </button>
                <button
                  onClick={() => onChange({ depositMode: "amount" })}
                  className={`px-2.5 py-2 text-[13px] font-semibold border-none border-l border-[#DAD5C6] ${depositMode === "amount" ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-[#FFFDF9] text-[#6E6A5C]"}`}
                >
                  $
                </button>
              </div>
              <TextInput type="number" value={depositDisplayValue} onChange={(e) => onChange({ depositValue: e.target.value })} />
            </div>
          </Field>
          <div className="font-mono text-[13px] mt-2">
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
