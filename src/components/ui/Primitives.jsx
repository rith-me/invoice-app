"use client";

import React from "react";
import { STATUS, CATEGORY_COLORS } from "@/lib/helpers";

// Status pill used on invoices/quotations (Draft, Sent, Paid, Overdue, Accepted, Declined).
// Colors are per-status and data-driven, so they stay as inline style rather than
// Tailwind classes — there's no fixed palette to express as utilities here.
export function Badge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span
      className="font-mono text-[11px] tracking-[0.06em] uppercase px-2 py-[3px] rounded-[3px] font-semibold whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

// Category pill used in the Items catalog (Curtain / Blinds). Same rationale as Badge.
export function CategoryBadge({ category }) {
  const c = CATEGORY_COLORS[category] || { color: "#6E6A5C", bg: "#EDEAE2" };
  return (
    <span
      className="font-mono text-[10.5px] tracking-[0.05em] uppercase px-2 py-[3px] rounded-[3px] font-semibold whitespace-nowrap"
      style={{ color: c.color, background: c.bg }}
    >
      {category || "—"}
    </span>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block mb-3.5 ${className}`}>
      <div className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-[#8A8574] mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}

export const inputClass =
  "font-body w-full box-border border border-[#DAD5C6] rounded text-[#1B2A3D] bg-[#FFFDF9] px-2.5 py-2 text-sm outline-none focus:border-[#1B2A3D] focus:ring-1 focus:ring-[#1B2A3D]";

export function TextInput({ className = "", ...props }) {
  return <input {...props} className={`${inputClass} ${className}`} />;
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="border border-dashed border-[#DAD5C6] rounded-lg px-6 py-12 text-center text-[#8A8574]">
      <div className="font-display text-lg text-[#1B2A3D] mb-1.5">{title}</div>
      <div className="text-sm mb-4">{body}</div>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ActionBtn({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-[#1B2A3D] whitespace-nowrap"
    >
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function KpiCard({ icon, label, value, sub, tone }) {
  return (
    <div className="border border-[#E4DFD3] rounded-lg px-4 py-3.5 bg-[#FFFDF9]">
      <div className="flex items-center gap-1.5 mb-2" style={{ color: tone }}>
        {icon}
        <span className="font-mono text-[10.5px] tracking-[0.05em] uppercase text-[#8A8574]">{label}</span>
      </div>
      <div className="font-mono text-xl font-bold text-[#1B2A3D]">{value}</div>
      {sub && <div className="text-[11.5px] text-[#8A8574] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Row({ label, value, bold }) {
  return (
    <div
      className={`flex justify-between py-1 ${bold ? "font-bold border-t border-[#DAD5C6] mt-1 pt-1.5" : "font-normal"}`}
    >
      <span className={bold ? "text-[#1B2A3D]" : "text-[#6E6A5C]"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export const panelTitleClass = "font-display text-[15px] font-semibold text-[#1B2A3D] mb-2.5";
export const backBtnClass = "flex items-center gap-1.5 bg-transparent border-none text-[#6E6A5C] text-sm p-0";
