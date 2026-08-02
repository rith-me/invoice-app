"use client";

import React from "react";
import { 
  FileText, 
  Users, 
  Settings as SettingsIcon2, 
  LayoutDashboard, 
  Package, 
  X,
  BarChart2,
  Truck,
  Receipt,
  DollarSign
} from "lucide-react";
import { money } from "@/lib/helpers";

function NavButton({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border-none text-left text-[14px] transition-colors ${
        active 
          ? "bg-[#ECE8DF] text-[#1B2A3D] font-semibold" 
          : "bg-transparent text-[#5C584C] hover:text-[#1B2A3D] font-normal"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="font-serif">{label}</span>
    </button>
  );
}

function NavLinks({ view, setView, onNavigate }) {
  const go = (v) => { setView(v); onNavigate?.(); };
  return (
    <nav className="flex flex-col gap-1">
      <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={17} />} label="Dashboard" onClick={() => go("dashboard")} />
      <NavButton active={view === "reports"} icon={<BarChart2 size={17} />} label="Reports" onClick={() => go("reports")} />
      <NavButton active={view === "invoices"} icon={<FileText size={17} />} label="Invoices" onClick={() => go("invoices")} />
      <NavButton active={view === "quotations"} icon={<FileText size={17} />} label="Quotations" onClick={() => go("quotations")} />
      <NavButton active={view === "receipts"} icon={<Receipt size={17} />} label="Receipts" onClick={() => go("receipts")} />
      <NavButton active={view === "purchase-orders"} icon={<Truck size={17} />} label="Purchase Orders" onClick={() => go("purchase-orders")} />
      <NavButton active={view === "expenses"} icon={<DollarSign size={17} />} label="Expenses" onClick={() => go("expenses")} />
      <NavButton active={view === "clients"} icon={<Users size={17} />} label="Clients" onClick={() => go("clients")} />
      <NavButton active={view === "items"} icon={<Package size={17} />} label="Items" onClick={() => go("items")} />
      <NavButton active={view === "settings"} icon={<SettingsIcon2 size={17} />} label="Business info" onClick={() => go("settings")} />
    </nav>
  );
}

function TotalsFooter({ totalsSummary }) {
  if (!totalsSummary) return null;

  return (
    <div className="font-mono text-[10.5px] text-[#8A8574] pt-3 border-t border-[#E4DFD3] mt-3">
      <div className="flex justify-between mb-1">
        <span>Outstanding</span>
        <span className="text-[#B5482F] font-semibold">{money(totalsSummary.outstanding)}</span>
      </div>
      <div className="flex justify-between">
        <span>Paid</span>
        <span className="text-[#3D6B5C] font-semibold">{money(totalsSummary.paid)}</span>
      </div>
    </div>
  );
}

/**
 * Desktop sidebar: a permanent 220px rail, visible from `lg` up.
 */
export function Sidebar({ view, setView, totalsSummary }) {
  return (
    <div className="no-print hidden lg:flex w-[220px] shrink-0 border-r border-[#E4DFD3] px-4 py-6 flex-col gap-1 bg-[#FAF8F3]">
      <div className="px-2 pb-5">
        <div className="font-display text-[22px] font-semibold text-[#1B2A3D]">Ledger</div>
        <div className="font-mono text-[10.5px] text-[#8A8574] tracking-[0.05em]">invoicing, kept simple</div>
      </div>
      <NavLinks view={view} setView={setView} />
      <div className="flex-1" />
      <TotalsFooter totalsSummary={totalsSummary} />
    </div>
  );
}

/**
 * Mobile top bar + slide-in drawer, visible below `lg`.
 */
export function MobileNav({ view, setView, totalsSummary, open, setOpen }) {
  return (
    <div className="no-print lg:hidden">
      <div className="flex items-center justify-between border-b border-[#E4DFD3] px-4 py-3 bg-[#FAF8F3]">
        <div className="font-display text-lg font-semibold text-[#1B2A3D]">Ledger</div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex flex-col justify-center gap-[3px] w-8 h-8 items-center bg-transparent border border-[#DAD5C6] rounded-md"
        >
          <span className="block w-4 h-[1.5px] bg-[#1B2A3D]" />
          <span className="block w-4 h-[1.5px] bg-[#1B2A3D]" />
          <span className="block w-4 h-[1.5px] bg-[#1B2A3D]" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-[260px] max-w-[80vw] h-full bg-[#FAF8F3] border-r border-[#E4DFD3] px-4 py-6 flex flex-col gap-1 overflow-y-auto">
            <div className="flex items-center justify-between px-2 pb-5">
              <div>
                <div className="font-display text-xl font-semibold text-[#1B2A3D]">Ledger</div>
                <div className="font-mono text-[10.5px] text-[#8A8574] tracking-[0.05em]">invoicing, kept simple</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="bg-transparent border-none text-[#6E6A5C] p-1">
                <X size={18} />
              </button>
            </div>
            <NavLinks view={view} setView={setView} onNavigate={() => setOpen(false)} />
            <div className="flex-1" />
            <TotalsFooter totalsSummary={totalsSummary} />
          </div>
        </div>
      )}
    </div>
  );
}