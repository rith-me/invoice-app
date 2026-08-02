"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { uid, todayISO, fmtDate } from "@/lib/helpers";
import { Field, TextInput, EmptyState, inputClass } from "@/components/ui/Primitives";

const SCHEDULE_TYPES = [
  { value: "measurement", label: "Measurement visit", color: "#8A6D3D", bg: "#F3EBDA" },
  { value: "install", label: "Installation", color: "#3D6B5C", bg: "#E3EDE8" },
  { value: "other", label: "Other", color: "#6E6A5C", bg: "#EDEAE2" },
];
function ScheduleTypeBadge({ type }) {
  const t = SCHEDULE_TYPES.find((x) => x.value === type) || SCHEDULE_TYPES[2];
  return (
    <span className="font-mono text-[10.5px] tracking-[0.05em] uppercase px-2 py-[3px] rounded-[3px] font-semibold whitespace-nowrap" style={{ color: t.color, background: t.bg }}>
      {t.label}
    </span>
  );
}

export function SchedulePanel({ schedule, updateSchedule, clients, showToast, onTrash }) {
  const blank = { date: todayISO(), time: "09:00", type: "measurement", clientId: "", clientName: "", address: "", phone: "", notes: "", status: "upcoming" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState("upcoming"); // upcoming | past | all

  function pickClient(clientId) {
    const c = clients.find((c) => c.id === clientId);
    setForm({ ...form, clientId, clientName: c?.name || form.clientName, address: c?.address || form.address, phone: c?.phone || form.phone });
  }
  function addOrUpdate() {
    if (!form.clientName.trim()) {
      showToast("Enter a client name first");
      return;
    }
    if (editingId) {
      updateSchedule(schedule.map((s) => (s.id === editingId ? { ...s, ...form } : s)));
      showToast("Visit updated");
    } else {
      updateSchedule([{ id: uid(), ...form }, ...schedule]);
      showToast("Visit scheduled");
    }
    setForm(blank);
    setEditingId(null);
  }
  function edit(s) {
    setForm({ date: s.date || todayISO(), time: s.time || "09:00", type: s.type || "measurement", clientId: s.clientId || "", clientName: s.clientName || "", address: s.address || "", phone: s.phone || "", notes: s.notes || "", status: s.status || "upcoming" });
    setEditingId(s.id);
  }
  function remove(id) {
    const s = schedule.find((x) => x.id === id);
    updateSchedule(schedule.filter((s) => s.id !== id));
    if (s && onTrash) onTrash(`${s.clientName} — ${fmtDate(s.date)}`, s);
    showToast("Visit moved to trash");
    if (editingId === id) { setEditingId(null); setForm(blank); }
  }

  const today = todayISO();
  const byTab = schedule.filter((s) => {
    if (tab === "upcoming") return s.date >= today;
    if (tab === "past") return s.date < today;
    return true;
  });
  const sorted = [...byTab].sort((a, b) => (tab === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold mb-5.5">Schedule</h1>
      <div className="flex flex-col lg:flex-row gap-7">
        <div className="w-full lg:w-[300px] shrink-0">
          <div className="border border-[#E4DFD3] rounded-lg p-4.5 bg-[#FFFDF9]">
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0"><Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field></div>
              <div className="flex-1 min-w-0"><Field label="Time"><TextInput type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field></div>
            </div>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                {SCHEDULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            {clients.length > 0 && (
              <Field label="Client (optional — autofills below)">
                <select value={form.clientId} onChange={(e) => pickClient(e.target.value)} className={inputClass}>
                  <option value="">— none —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Client name"><TextInput value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></Field>
            <Field label="Address"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Notes"><textarea rows={2} className={`${inputClass} resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <button onClick={addOrUpdate} className="flex-1 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3 py-2 rounded-md text-[13.5px] font-semibold">
                {editingId ? "Save changes" : "Schedule visit"}
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
            {[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`border-none rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${tab === key ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-transparent text-[#6E6A5C]"}`}>
                {label}
              </button>
            ))}
          </div>

          {sorted.length === 0 ? (
            <EmptyState title="Nothing scheduled" body="Book a measurement visit, installation, or other appointment on the left." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {sorted.map((s) => (
                <div key={s.id} onClick={() => edit(s)} className="border border-[#E4DFD3] rounded-lg px-4 py-3.5 flex justify-between items-center gap-3 bg-[#FFFDF9] flex-wrap cursor-pointer">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="font-mono text-[13px] text-[#1B2A3D] font-semibold shrink-0">{fmtDate(s.date)}<div className="text-[11.5px] text-[#8A8574] font-normal">{s.time}</div></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[14px]">{s.clientName}</span>
                        <ScheduleTypeBadge type={s.type} />
                      </div>
                      <div className="text-[12.5px] text-[#6E6A5C]">{s.address}{s.address && s.phone ? " · " : ""}{s.phone}</div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remove this visit?`)) remove(s.id); }} className="bg-transparent border-none text-[#B5482F] p-1.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
