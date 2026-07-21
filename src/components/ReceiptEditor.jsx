"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Field, TextInput, inputClass, backBtnClass } from "@/components/ui/Primitives";
import { PAYMENT_METHODS } from "@/lib/helpers";

export function ReceiptEditor({ receipt, clients, onChange, onDone, onBack }) {
  function pickClient(clientId) {
    const c = clients.find((c) => c.id === clientId);
    onChange({ clientId, clientName: c?.name || "", clientAddress: c?.address || "", clientPhone: c?.phone || "" });
  }

  return (
    <div className="max-w-[560px]">
      <button onClick={onBack} className={`no-print ${backBtnClass}`}><ArrowLeft size={14} /> All receipts</button>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-3 my-3.5 mb-5.5">
        <h1 className="font-display text-2xl font-semibold m-0">Editing receipt {receipt.quoteNumber}</h1>
        <button onClick={onDone} className="self-start bg-[#1B2A3D] text-[#FAF8F3] border-none px-4.5 py-2 rounded-md text-[13.5px] font-semibold">Done</button>
      </div>

      <div className="border border-[#E4DFD3] rounded-lg p-5 bg-[#FFFDF9]">
        <div className="flex flex-wrap gap-4">
          <div className="w-full sm:w-[180px]"><Field label="Receipt #"><TextInput value={receipt.quoteNumber} onChange={(e) => onChange({ quoteNumber: e.target.value })} /></Field></div>
          <div className="w-full sm:w-[180px]"><Field label="Date"><TextInput type="date" value={receipt.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} /></Field></div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Field label="Client">
              <select value={receipt.clientId || ""} onChange={(e) => pickClient(e.target.value)} className={inputClass}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="w-full sm:w-[180px]"><Field label="For invoice # (optional)"><TextInput value={receipt.invoiceRef} onChange={(e) => onChange({ invoiceRef: e.target.value })} placeholder="e.g. 20260001" /></Field></div>
        </div>

        <Field label="Received from (name)"><TextInput value={receipt.clientName} onChange={(e) => onChange({ clientName: e.target.value })} /></Field>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]"><Field label="Address"><TextInput value={receipt.clientAddress} onChange={(e) => onChange({ clientAddress: e.target.value })} /></Field></div>
          <div className="w-full sm:w-40"><Field label="Phone"><TextInput value={receipt.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} /></Field></div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="w-full sm:w-[180px]"><Field label="Amount received ($)"><TextInput type="number" value={receipt.amountReceived} onChange={(e) => onChange({ amountReceived: e.target.value })} /></Field></div>
          <div className="w-full sm:w-[180px]">
            <Field label="Payment method">
              <select value={receipt.paymentMethod} onChange={(e) => onChange({ paymentMethod: e.target.value })} className={inputClass}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="w-full sm:w-40"><Field label="Balance remaining ($)"><TextInput type="number" value={receipt.balanceRemaining} onChange={(e) => onChange({ balanceRemaining: e.target.value })} /></Field></div>
        </div>

        <Field label="Notes"><textarea rows={3} className={`${inputClass} resize-y`} value={receipt.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>
      </div>
    </div>
  );
}
