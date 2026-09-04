"use client";

import React from "react";
import { FileText, Users, Settings as SettingsIcon2, LayoutDashboard, Package, X, BarChart3, Truck, Receipt, CalendarDays, ShieldCheck, Trash2 } from "lucide-react";
import { money } from "@/lib/helpers";

const NAV_ICON_COLORS = {
  dashboard: "#4F46E5",
  reports: "#0369A1",
  invoices: "#16A34A",
  quotations: "#EA580C",
  receipts: "#9333EA",
  "purchase-orders": "#2563EB",
  expenses: "#E11D48",
  schedule: "#0891B2",
  warranty: "#15803D",
  clients: "#C05621",
  items: "#7C3AED",
  settings: "#4B5563",
  trash: "#DC2626",
};

function NavButton({ active, icon: Icon, iconColor, label, onClick }) {
  const activeStyle = active
    ? {
        backgroundColor: `${iconColor}1A`, // ~10% opacity background
        color: iconColor,
        fontWeight: 600,
      }
    : {};

  return (
    <button
      onClick={onClick}
      style={activeStyle}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border-none text-left text-[13.5px] font-body transition-colors ${
        active ? "" : "bg-transparent text-[#6E6A5C] font-normal hover:bg-[#EDEAE2]/50"
      }`}
    >
      <Icon size={15} color={iconColor} />
      {label}
    </button>
  );
}

function NavLinks({ view, setView, onNavigate, trashCount }) {
  const go = (v) => { setView(v); onNavigate?.(); };
  return (
    <>
      <NavButton active={view === "dashboard"} icon={LayoutDashboard} iconColor={NAV_ICON_COLORS.dashboard} label="Dashboard" onClick={() => go("dashboard")} />
      <NavButton active={view === "reports"} icon={BarChart3} iconColor={NAV_ICON_COLORS.reports} label="Reports" onClick={() => go("reports")} />
      <NavButton active={view === "invoices"} icon={FileText} iconColor={NAV_ICON_COLORS.invoices} label="Invoices" onClick={() => go("invoices")} />
      <NavButton active={view === "quotations"} icon={FileText} iconColor={NAV_ICON_COLORS.quotations} label="Quotations" onClick={() => go("quotations")} />
      <NavButton active={view === "receipts"} icon={FileText} iconColor={NAV_ICON_COLORS.receipts} label="Receipts" onClick={() => go("receipts")} />
      <NavButton active={view === "purchase-orders"} icon={Truck} iconColor={NAV_ICON_COLORS["purchase-orders"]} label="Purchase Orders" onClick={() => go("purchase-orders")} />
      <NavButton active={view === "expenses"} icon={Receipt} iconColor={NAV_ICON_COLORS.expenses} label="Expenses" onClick={() => go("expenses")} />
      <NavButton active={view === "schedule"} icon={CalendarDays} iconColor={NAV_ICON_COLORS.schedule} label="Schedule" onClick={() => go("schedule")} />
      <NavButton active={view === "warranty"} icon={ShieldCheck} iconColor={NAV_ICON_COLORS.warranty} label="Warranty" onClick={() => go("warranty")} />
      <NavButton active={view === "clients"} icon={Users} iconColor={NAV_ICON_COLORS.clients} label="Clients" onClick={() => go("clients")} />
      <NavButton active={view === "items"} icon={Package} iconColor={NAV_ICON_COLORS.items} label="Items" onClick={() => go("items")} />
      <NavButton active={view === "settings"} icon={SettingsIcon2} iconColor={NAV_ICON_COLORS.settings} label="Business info" onClick={() => go("settings")} />
      <NavButton active={view === "trash"} icon={Trash2} iconColor={NAV_ICON_COLORS.trash} label={`Trash${trashCount ? ` (${trashCount})` : ""}`} onClick={() => go("trash")} />
    </>
  );
}

function TotalsFooter({ totalsSummary }) {
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

function BrandBlock({ currentUser, onLogout, compact }) {
  return (
    <div className="px-2 pb-5">
      <div className={`font-display font-semibold text-[#1B2A3D] ${compact ? "text-xl" : "text-[22px]"}`}>CTL Cloud</div>
      <div className="font-mono text-[10.5px] text-[#8A8574] tracking-[0.05em]">invoicing, kept simple</div>
      {currentUser && (
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#E4DFD3]">
          <span className="text-xs text-[#6E6A5C]">Signed in: <strong className="text-[#1B2A3D]">{currentUser.name}</strong></span>
          <button onClick={onLogout} className="bg-transparent border-none text-[#8A8574] text-[11.5px] underline p-0">Log out</button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ view, setView, totalsSummary, trashCount, currentUser, onLogout }) {
  return (
    <div className="no-print hidden lg:flex w-[220px] shrink-0 border-r border-[#E4DFD3] px-4 py-6 flex-col gap-1">
      <BrandBlock currentUser={currentUser} onLogout={onLogout} />
      <NavLinks view={view} setView={setView} trashCount={trashCount} />
      <div className="flex-1" />
      <TotalsFooter totalsSummary={totalsSummary} />
    </div>
  );
}

export function MobileNav({ view, setView, totalsSummary, open, setOpen, trashCount, currentUser, onLogout }) {
  return (
    <div className="no-print lg:hidden">
      <div className="flex items-center justify-between border-b border-[#E4DFD3] px-4 py-3">
        <div className="font-display text-lg font-semibold text-[#1B2A3D]">CTL Cloud</div>
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
              <BrandBlock currentUser={currentUser} onLogout={onLogout} compact />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="bg-transparent border-none text-[#6E6A5C] p-1 shrink-0">
                <X size={18} />
              </button>
            </div>
            <NavLinks view={view} setView={setView} onNavigate={() => setOpen(false)} trashCount={trashCount} />
            <div className="flex-1" />
            <TotalsFooter totalsSummary={totalsSummary} />
          </div>
        </div>
      )}
    </div>
  );
}