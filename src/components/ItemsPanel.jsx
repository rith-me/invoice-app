"use client";

import React, { useState, useMemo } from "react";
import { Trash2, Upload, Download, Package } from "lucide-react";
import * as XLSX from "xlsx";
import { uid, money, num, todayISO, marginPct, ITEM_UNITS, ITEM_CATEGORIES } from "@/lib/helpers";
import { CSV_TEMPLATE, parseItemsCsv } from "@/lib/itemsCsv";
import { Field, TextInput, EmptyState, CategoryBadge, inputClass } from "@/components/ui/Primitives";

export function ItemsPanel({ items, updateItems, showToast }) {
  const blank = { code: "", desc: "", category: ITEM_CATEGORIES[0], unit: "m2", supplierName: "", cost: 0, rate: 0, stock: 0, imageDataUrl: "" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState("");
  const [imageError, setImageError] = useState("");

  const preview = useMemo(() => (csvText.trim() ? parseItemsCsv(csvText) : { parsed: [], skipped: 0 }), [csvText]);

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.onerror = () => setImportError("Couldn't read that file — try again or paste the data instead.");
    reader.readAsText(file);
  }
  function commitImport() {
    if (preview.parsed.length === 0) {
      setImportError("Nothing to import — check that your file has a Description column.");
      return;
    }
    updateItems([...preview.parsed, ...items]);
    showToast(`Imported ${preview.parsed.length} item${preview.parsed.length === 1 ? "" : "s"}${preview.skipped ? ` · skipped ${preview.skipped}` : ""}`);
    setCsvText("");
    setImportError("");
    setShowImport(false);
  }
  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "items-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportItemsExcel() {
    const rows = filtered.map((it) => ({
      Category: it.category || "",
      Code: it.code || "",
      Description: it.desc || "",
      Supplier: it.supplierName || "",
      Unit: ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit || "",
      Stock: num(it.stock),
      Cost: num(it.cost),
      Rate: num(it.rate),
      "Margin %": +marginPct(it.rate, it.cost).toFixed(1),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, `items_${todayISO()}.xlsx`);
  }
  function handleItemImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setImageError("Image is too large — please use one under ~3.5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imageDataUrl: reader.result }));
    reader.onerror = () => setImageError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  }

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
  function edit(it) {
    setForm({ code: it.code || "", desc: it.desc, category: it.category || ITEM_CATEGORIES[0], unit: it.unit || "m2", supplierName: it.supplierName || "", cost: it.cost ?? 0, rate: it.rate ?? 0, stock: it.stock ?? 0, imageDataUrl: it.imageDataUrl || "" });
    setEditingId(it.id);
  }
  function remove(id) {
    updateItems(items.filter((it) => it.id !== id));
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const byCategory = filter === "all" ? items : items.filter((it) => it.category === filter);
  const sq = search.trim().toLowerCase();
  const filtered = !sq
    ? byCategory
    : byCategory.filter((it) =>
        (it.supplierName || "").toLowerCase().includes(sq) ||
        (it.code || "").toLowerCase().includes(sq) ||
        (it.desc || "").toLowerCase().includes(sq)
      );
  const formMargin = marginPct(form.rate, form.cost);
  const formProfit = num(form.rate) - num(form.cost);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-5.5">
        <h1 className="font-display text-[28px] font-semibold m-0">Items</h1>
        <div className="flex gap-2 flex-wrap">
          {items.length > 0 && (
            <button onClick={exportItemsExcel} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] text-[#1B2A3D] px-4 py-2 rounded-md text-[13.5px] font-semibold">
              <Download size={15} /> Export Excel
            </button>
          )}
          <button onClick={() => setShowImport((v) => !v)} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] text-[#1B2A3D] px-4 py-2 rounded-md text-[13.5px] font-semibold">
            <Upload size={15} /> {showImport ? "Close import" : "Mass upload"}
          </button>
        </div>
      </div>

      {showImport && (
        <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9] mb-5.5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2.5 mb-3">
            <div>
              <div className="font-display text-base font-semibold mb-1">Mass upload items</div>
              <div className="text-[12.5px] text-[#8A8574]">Upload a CSV with columns: Category, Code, Description, Supplier Name, Unit, Cost, Rate. Only Description is required.</div>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-[#1B2A3D] shrink-0 self-start">
              <Download size={13} /> Download template
            </button>
          </div>

          <div className="flex gap-4 mb-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3.5 py-2 rounded-md text-[13px] font-semibold cursor-pointer">
              <Upload size={14} /> Choose CSV file
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
            </label>
            {csvText && <button onClick={() => { setCsvText(""); setImportError(""); }} className="bg-transparent border border-[#DAD5C6] rounded-md px-3.5 py-2 text-[13px]">Clear</button>}
          </div>

          <Field label="Or paste CSV data">
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setImportError(""); }}
              placeholder={"Category,Code,Description,Supplier Name,Unit,Cost,Rate\nCurtain,LKA 328-4,Curtain Fabric 320cm,ABC Fabric Supply,m2,6.00,10.50"}
              className={`${inputClass} resize-y font-mono text-[12.5px]`}
            />
          </Field>

          {csvText.trim() && (
            <div className={`text-[12.5px] mb-2.5 font-semibold ${preview.parsed.length ? "text-[#3D6B5C]" : "text-[#B5482F]"}`}>
              {preview.parsed.length} item{preview.parsed.length === 1 ? "" : "s"} ready to import{preview.skipped ? ` · ${preview.skipped} row${preview.skipped === 1 ? "" : "s"} skipped (missing description)` : ""}
            </div>
          )}

          {preview.parsed.length > 0 && (
            <div className="border border-[#E4DFD3] rounded-md overflow-hidden mb-3.5 max-h-[180px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px] min-w-[560px]">
                  <thead>
                    <tr className="bg-[#F1EDE3] text-left sticky top-0">
                      {["Category", "Code", "Description", "Supplier", "Unit", "Stock", "Cost", "Rate"].map((h) => (
                        <th key={h} className="px-2.5 py-1.5 text-[10px] font-mono text-[#8A8574] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.parsed.slice(0, 8).map((it) => (
                      <tr key={it.id} className="border-t border-[#EDEAE2]">
                        <td className="px-2.5 py-1.5">{it.category}</td>
                        <td className="font-mono px-2.5 py-1.5">{it.code || "—"}</td>
                        <td className="px-2.5 py-1.5">{it.desc}</td>
                        <td className="px-2.5 py-1.5">{it.supplierName || "—"}</td>
                        <td className="px-2.5 py-1.5">{it.unit}</td>
                        <td className="font-mono px-2.5 py-1.5">{it.stock}</td>
                        <td className="font-mono px-2.5 py-1.5">{money(it.cost)}</td>
                        <td className="font-mono px-2.5 py-1.5">{money(it.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.parsed.length > 8 && <div className="px-2.5 py-1.5 text-[11.5px] text-[#8A8574]">+ {preview.parsed.length - 8} more…</div>}
            </div>
          )}

          {importError && <div className="text-[#B5482F] text-[12.5px] mb-2.5">{importError}</div>}

          <div className="flex gap-2">
            <button onClick={commitImport} disabled={preview.parsed.length === 0} className={`border-none px-4 py-2 rounded-md text-[13.5px] font-semibold ${preview.parsed.length ? "bg-[#1B2A3D] text-[#FAF8F3] cursor-pointer" : "bg-[#DAD5C6] text-[#FAF8F3] cursor-not-allowed"}`}>
              Import {preview.parsed.length || ""} item{preview.parsed.length === 1 ? "" : "s"}
            </button>
            <button onClick={() => setShowImport(false)} className="bg-transparent border border-[#DAD5C6] px-4 py-2 rounded-md text-[13.5px]">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-7">
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
            <Field label="Photo">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-lg border border-[#DAD5C6] bg-[#FFFDF9] flex items-center justify-center overflow-hidden shrink-0">
                  {form.imageDataUrl ? (
                    <img src={form.imageDataUrl} alt="Item preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-mono text-[10px] text-[#8A8574]">none</span>
                  )}
                </div>
                <div>
                  <label className="inline-block bg-transparent border border-[#DAD5C6] rounded-md px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer">
                    Upload photo
                    <input type="file" accept="image/*" onChange={handleItemImage} className="hidden" />
                  </label>
                  {form.imageDataUrl && (
                    <button onClick={() => setForm({ ...form, imageDataUrl: "" })} className="ml-2 bg-transparent border-none text-[#B5482F] text-[12.5px]">Remove</button>
                  )}
                  {imageError && <div className="text-[#B5482F] text-[11.5px] mt-1.5">{imageError}</div>}
                </div>
              </div>
            </Field>
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
            <Field label={`Stock on hand (${ITEM_UNITS.find((u) => u.value === form.unit)?.label || form.unit})`}><TextInput type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
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
          <div className="mb-2.5">
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by supplier, code, or description…" className="max-w-[360px]" />
          </div>
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
            <EmptyState title={items.length === 0 ? "No items yet" : sq ? "No matches" : "Nothing in this category"} body={sq ? "Try a different search term." : "Register products or services here so you can add them to invoices with one click."} />
          ) : (
            <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px] min-w-[820px]">
                  <thead>
                    <tr className="bg-[#F1EDE3] text-left">
                      {["", "Category", "Code", "Description", "Supplier", "Unit", "Stock", "Cost", "Rate", "Margin", ""].map((h) => (
                        <th key={h} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-[#8A8574] font-semibold px-3.5 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it, idx) => {
                      const m = marginPct(it.rate, it.cost);
                      return (
                        <tr key={it.id} className={`border-t border-[#E4DFD3] ${idx % 2 ? "bg-[#FCFAF5]" : "bg-[#FFFDF9]"}`}>
                          <td className="py-2 pl-3.5">
                            <div className="w-[34px] h-[34px] rounded-md overflow-hidden bg-[#F1EDE3] flex items-center justify-center shrink-0">
                              {it.imageDataUrl ? <img src={it.imageDataUrl} alt="" className="w-full h-full object-cover" /> : <Package size={14} color="#B7AF98" />}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5"><CategoryBadge category={it.category} /></td>
                          <td className="font-mono px-3.5 py-2.5">{it.code || "—"}</td>
                          <td className="px-3.5 py-2.5">{it.desc}</td>
                          <td className="text-[#6E6A5C] px-3.5 py-2.5">{it.supplierName || "—"}</td>
                          <td className="text-[#6E6A5C] px-3.5 py-2.5">{ITEM_UNITS.find((u) => u.value === it.unit)?.label || it.unit}</td>
                          <td className={`font-mono font-semibold px-3.5 py-2.5 ${num(it.stock) <= 0 ? "text-[#B5482F]" : "text-[#1B2A3D]"}`}>{num(it.stock)}</td>
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