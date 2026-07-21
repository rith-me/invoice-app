"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { uid, money, num, marginPct, ITEM_UNITS, ITEM_CATEGORIES } from "@/lib/helpers";
import { Field, TextInput, EmptyState, CategoryBadge, inputClass } from "@/components/ui/Primitives";

export function ItemsPanel({ items, updateItems, showToast }) {
  const [form, setForm] = useState({ code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0 });
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");

  const blank = { code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0 };

  function addOrUpdate() {
    if (!form.desc.trim()) return;
    if (editingId) {
      updateItems(items.map((it) => (it.id === editingId ? { ...it, ...form } : it)));
      showToast("Item updated");
    } else {
      updateItems([{ id: uid(), ...form }, ...items]);
      showToast("Item added");
    }
    setForm(blank);
    setEditingId(null);
  }
  function edit(it) { setForm({ code: it.code || "", desc: it.desc, category: it.category || ITEM_CATEGORIES[0], unit: it.unit || "m2", supplierName: it.supplierName || "", cost: it.cost ?? 0, rate: it.rate ?? 0 }); setEditingId(it.id); }
  function remove(id) {
    updateItems(items.filter((it) => it.id !== id));
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const filtered = filter === "all" ? items : items.filter((it) => it.category === filter);
  const formMargin = marginPct(form.rate, form.cost);
  const formProfit = num(form.rate) - num(form.cost);

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold mb-5">Items</h1>
      <div className="flex flex-col lg:flex-row gap-7">
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Code"><TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="AW101 50mm" /></Field>
            <Field label="Description"><TextInput value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Wooden Blinds" /></Field>
            <Field label="Unit">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass}>
                {ITEM_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Field>
            <Field label="Supplier name"><TextInput value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="e.g. ABC Fabric Supply" /></Field>
            <div className="flex gap-2.5">
              <div className="flex-1"><Field label="Cost ($)"><TextInput type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field></div>
              <div className="flex-1"><Field label="Rate ($)"><TextInput type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field></div>
            </div>
            <div className={`flex justify-between text-[12.5px] font-mono mb-3.5 -mt-1.5 px-2.5 py-1.5 bg-[#F1EDE3] rounded ${formMargin < 0 ? "text-[#B5482F]" : "text-[#3D6B5C]"}`}>
              <span>Margin: {formMargin.toFixed(1)}%</span>
              <span>Profit: {money(formProfit)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={addOrUpdate} className="flex-1 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3 py-2 rounded-md text-[13.5px] font-semibold">
                {editingId ? "Save changes" : "Add item"}
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
          <div className="flex gap-1 mb-3.5 flex-wrap">
            {["all", ...ITEM_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`border-none rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${filter === c ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-transparent text-[#6E6A5C]"}`}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title={items.length === 0 ? "No items yet" : "Nothing in this category"} body="Register products or services here so you can add them to invoices with one click." />
          ) : (
            <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px] min-w-[760px]">
                  <thead>
                    <tr className="bg-[#F1EDE3] text-left">
                      {["Category", "Code", "Description", "Supplier", "Unit", "Cost", "Rate", "Margin", ""].map((h) => (
                        <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it, idx) => {
                      const m = marginPct(it.rate, it.cost);
                      return (
                        <tr key={it.id} className={`border-t border-[#E4DFD3] ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                          <td className="px-3.5 py-2.5"><CategoryBadge category={it.category} /></td>
                          <td className="font-mono px-3.5 py-2.5">{it.code || "—"}</td>
                          <td className="px-3.5 py-2.5">{it.desc}</td>
                          <td className="text-[#6E6A5C] px-3.5 py-2.5">{it.supplierName || "—"}</td>
                          <td className="text-[#6E6A5C] px-3.5 py-2.5">{ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit}</td>
                          <td className="font-mono text-[#6E6A5C] px-3.5 py-2.5">{money(num(it.cost))}</td>
                          <td className="font-mono px-3.5 py-2.5">{money(num(it.rate))}</td>
                          <td className={`font-mono font-semibold px-3.5 py-2.5 ${m < 0 ? "text-[#B5482F]" : "text-[#3D6B5C]"}`}>{m.toFixed(1)}%</td>
                          <td className="text-right px-3.5 py-2.5">
                            <div className="flex gap-1.5 justify-end">
                              <button onClick={() => edit(it)} className="bg-transparent border border-[#DAD5C6] rounded-md px-2 py-1 text-xs">Edit</button>
                              <button onClick={() => { if (confirm(`Remove ${it.desc}?`)) remove(it.id); }} className="bg-transparent border-none text-[#B5482F] p-1"><Trash2 size={13} /></button>
                            </div>
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
      </div>
    </div>
  );
}
