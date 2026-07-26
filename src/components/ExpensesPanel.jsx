"use client";

import React, { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { uid, todayISO, fmtDate, money, num, calcTotals, PAYMENT_METHODS } from "@/lib/helpers";
import { Field, TextInput, EmptyState, inputClass } from "@/components/ui/Primitives";

export const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Wages", "Materials", "Transport", "Marketing", "Other"];
export const EXPENSE_CATEGORY_COLORS = {
  Rent: { color: "#8A6D3D", bg: "#F3EBDA" },
  Utilities: { color: "#3D6B5C", bg: "#E3EDE8" },
  Wages: { color: "#1B2A3D", bg: "#E0E5EC" },
  Materials: { color: "#6E6A5C", bg: "#EDEAE2" },
  Transport: { color: "#4A6B8A", bg: "#DFE7EE" },
  Marketing: { color: "#8A4A6B", bg: "#EEDFE7" },
  Other: { color: "#7A7566", bg: "#EDEAE2" },
};

function ExpenseCategoryBadge({ category }) {
  const c = EXPENSE_CATEGORY_COLORS[category] || { color: "#6E6A5C", bg: "#EDEAE2" };
  return (
    <span
      className="font-mono text-[10.5px] tracking-[0.05em] uppercase px-2 py-[3px] rounded-[3px] font-semibold whitespace-nowrap"
      style={{ color: c.color, background: c.bg }}
    >
      {category || "—"}
    </span>
  );
}

export function ExpensesPanel({ expenses, updateExpenses, showToast, purchaseOrders, onLinkPO }) {
  const blank = { date: todayISO(), category: EXPENSE_CATEGORIES[0], payee: "", description: "", amount: 0, paymentMethod: "Cash", reference: "", notes: "", poId: "" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");

  const unpaidPOs = useMemo(() => (purchaseOrders || []).filter((po) => po.status !== "cancelled"), [purchaseOrders]);

  function pickPO(poId) {
    const po = (purchaseOrders || []).find((p) => p.id === poId);
    if (!po) { setForm({ ...form, poId: "" }); return; }
    const { total } = calcTotals(po);
    setForm({
      ...form,
      poId,
      payee: po.clientName || form.payee,
      amount: +total.toFixed(2),
      reference: po.quoteNumber,
      category: "Materials",
      description: form.description || `Payment for ${po.quoteNumber}`,
    });
  }

  function addOrUpdate() {
    if (!form.payee.trim() && !form.description.trim()) return;
    if (editingId) {
      updateExpenses(expenses.map((e) => (e.id === editingId ? { ...e, ...form } : e)));
      showToast("Expense updated");
    } else {
      updateExpenses([{ id: uid(), ...form }, ...expenses]);
      showToast("Expense added");
    }
    if (form.poId && onLinkPO) onLinkPO(form.poId);
    setForm(blank);
    setEditingId(null);
  }
  function edit(e) {
    setForm({ date: e.date || todayISO(), category: e.category || EXPENSE_CATEGORIES[0], payee: e.payee || "", description: e.description || "", amount: e.amount ?? 0, paymentMethod: e.paymentMethod || "Cash", reference: e.reference || "", notes: e.notes || "", poId: e.poId || "" });
    setEditingId(e.id);
  }
  function remove(id) {
    updateExpenses(expenses.filter((e) => e.id !== id));
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const filtered = filter === "all" ? expenses : expenses.filter((e) => e.category === filter);
  const filteredTotal = filtered.reduce((s, e) => s + num(e.amount), 0);
  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold mb-5.5">Expenses</h1>
      <div className="flex flex-col lg:flex-row gap-7">
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0"><Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field></div>
              <div className="flex-1 min-w-0">
                <Field label="Category">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            {unpaidPOs.length > 0 && (
              <Field label="Link to Purchase Order (optional)">
                <select value={form.poId} onChange={(e) => pickPO(e.target.value)} className={inputClass}>
                  <option value="">— none —</option>
                  {unpaidPOs.map((po) => {
                    const { total } = calcTotals(po);
                    return (
                      <option key={po.id} value={po.id}>
                        {po.quoteNumber} — {po.clientName || "Unknown supplier"} — {money(total)}{po.status === "paid" ? " (already paid)" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
            )}
            {form.poId && (
              <div className="text-[11.5px] text-[#3D6B5C] bg-[#E3EDE8] border border-[#C8DCD2] rounded-md px-2.5 py-1.5 mb-3.5 -mt-1.5">
                Saving will mark this purchase order as paid to supplier.
              </div>
            )}
            <Field label="Paid to (payee)"><TextInput value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="e.g. City Power & Water" /></Field>
            <Field label="Description"><TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. June electricity bill" /></Field>
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0"><Field label="Amount ($)"><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field></div>
              <div className="flex-1 min-w-0">
                <Field label="Payment method">
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className={inputClass}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Reference # (optional)"><TextInput value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="receipt or invoice #" /></Field>
            <Field label="Notes (optional)"><textarea rows={2} className={`${inputClass} resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <button onClick={addOrUpdate} className="flex-1 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3 py-2 rounded-md text-[13.5px] font-semibold">
                {editingId ? "Save changes" : "Add expense"}
              </button>
              {editingId && (
                <button onClick={() => { setEditingId(null); setForm(blank); }} className="bg-transparent border border-[#DAD5C6] px-3 py-2 rounded-md text-[13.5px]">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3.5">
            <div className="flex gap-1 flex-wrap">
              {["all", ...EXPENSE_CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`border-none rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${filter === c ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-transparent text-[#6E6A5C]"}`}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
            {filtered.length > 0 && (
              <div className="font-mono text-[13px] font-bold text-[#B5482F]">Total: {money(filteredTotal)}</div>
            )}
          </div>

          {sorted.length === 0 ? (
            <EmptyState title={expenses.length === 0 ? "No expenses yet" : "Nothing in this category"} body="Log business expenses here to track spend and see it reflected on your dashboard." />
          ) : (
            <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px] min-w-[720px]">
                  <thead>
                    <tr className="bg-[#F1EDE3] text-left">
                      {["Date", "Category", "Payee", "Description", "PO", "Amount", "Method", ""].map((h) => (
                        <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((e, idx) => (
                      <tr key={e.id} onClick={() => edit(e)} className={`border-t border-[#E4DFD3] cursor-pointer ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                        <td className="text-[#6E6A5C] px-3.5 py-2.5">{fmtDate(e.date)}</td>
                        <td className="px-3.5 py-2.5"><ExpenseCategoryBadge category={e.category} /></td>
                        <td className="px-3.5 py-2.5">{e.payee || "—"}</td>
                        <td className="text-[#6E6A5C] px-3.5 py-2.5">{e.description || "—"}</td>
                        <td className="font-mono text-[#6E6A5C] px-3.5 py-2.5">{e.reference || "—"}</td>
                        <td className="font-mono font-semibold px-3.5 py-2.5">{money(num(e.amount))}</td>
                        <td className="text-[#6E6A5C] px-3.5 py-2.5">{e.paymentMethod}</td>
                        <td className="text-right px-3.5 py-2.5">
                          <button onClick={(ev) => { ev.stopPropagation(); if (confirm("Delete this expense?")) remove(e.id); }} className="bg-transparent border-none text-[#B5482F] p-1" title="Delete">
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
      </div>
    </div>
  );
}
