"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { uid } from "@/lib/helpers";
import { Field, TextInput, EmptyState, inputClass } from "@/components/ui/Primitives";

export function ClientsPanel({ clients, updateClients, showToast }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [editingId, setEditingId] = useState(null);

  function addOrUpdate() {
    if (!form.name.trim()) return;
    if (editingId) {
      updateClients(clients.map((c) => (c.id === editingId ? { ...c, ...form } : c)));
      showToast("Client updated");
    } else {
      updateClients([{ id: uid(), ...form }, ...clients]);
      showToast("Client added");
    }
    setForm({ name: "", email: "", phone: "", address: "" });
    setEditingId(null);
  }
  function edit(c) { setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "" }); setEditingId(c.id); }
  function remove(id) {
    updateClients(clients.filter((c) => c.id !== id));
    if (editingId === id) { setEditingId(null); setForm({ name: "", email: "", phone: "", address: "" }); }
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold mb-5">Clients</h1>
      <div className="flex flex-col lg:flex-row gap-7">
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
            <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Apple Uk" /></Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="077896988" /></Field>
            <Field label="Email"><TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" /></Field>
            <Field label="Address">
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} className={`${inputClass} resize-y`} placeholder="Arey Khsat Borey Toul Songkea, #309 St.05" />
            </Field>
            <div className="flex gap-2">
              <button onClick={addOrUpdate} className="flex-1 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3 py-2 rounded-md text-[13.5px] font-semibold">
                {editingId ? "Save changes" : "Add client"}
              </button>
              {editingId && (
                <button onClick={() => { setEditingId(null); setForm({ name: "", email: "", phone: "", address: "" }); }} className="bg-transparent border border-[#DAD5C6] px-3 py-2 rounded-md text-[13.5px]">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {clients.length === 0 ? (
            <EmptyState title="No clients yet" body="Add a client on the left to bill them." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {clients.map((c) => (
                <div key={c.id} className="border border-[#E4DFD3] rounded-lg px-4 py-3.5 flex justify-between items-center gap-3 bg-[#FFFDF9] flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14.5px]">{c.name}</div>
                    <div className="text-[13px] text-[#6E6A5C]">{c.phone}{c.phone && c.email ? " · " : ""}{c.email}</div>
                    {c.address && <div className="text-[12.5px] text-[#8A8574] mt-0.5">{c.address}</div>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => edit(c)} className="bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px]">Edit</button>
                    <button onClick={() => { if (confirm(`Remove ${c.name}?`)) remove(c.id); }} className="bg-transparent border-none text-[#B5482F] p-1.5"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
