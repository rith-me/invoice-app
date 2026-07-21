"use client";

import React from "react";
import { ArrowLeft, Printer, FileText, Trash2 } from "lucide-react";
import { fmtDate, money, num } from "@/lib/helpers";
import { ActionBtn, backBtnClass } from "@/components/ui/Primitives";

const labelInlineClass = "font-mono text-[10.5px] text-[#8A8574] uppercase tracking-[0.05em]";

export function ReceiptView({ receipt, settings, onBack, onEdit, onDelete }) {
  const initials = (settings.businessName || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const balance = num(receipt.balanceRemaining);

  return (
    <div className="max-w-[620px]">
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4.5">
        <button onClick={onBack} className={backBtnClass}><ArrowLeft size={14} /> All receipts</button>
        <div className="flex gap-2 flex-wrap">
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={() => window.print()} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={() => { if (confirm(`Delete ${receipt.quoteNumber}?`)) onDelete(); }} className="bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[#B5482F]"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="print-sheet font-body bg-[#FFFDF9] border border-[#E4DFD3] rounded-[10px] px-5 py-8 sm:px-11 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6.5">
          <div className="flex gap-3 items-center">
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="" className="w-12 h-12 rounded-lg object-contain shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[#1B2A3D] text-[#FAF8F3] flex items-center justify-center font-display font-bold text-[17px] shrink-0">
                {initials}
              </div>
            )}
            <div>
              <div className="font-display text-[19px] font-bold">{settings.businessName}</div>
              {settings.tagline && <div className="text-[11.5px] text-[#8A8574] tracking-[0.03em]">{settings.tagline}</div>}
              {settings.address && <div className="text-xs text-[#6E6A5C] mt-1 whitespace-pre-line">{settings.address}</div>}
              {settings.phone && <div className="text-xs text-[#6E6A5C]">Tel: {settings.phone}</div>}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-display text-[28px] font-bold text-[#1B2A3D] tracking-[0.02em]">RECEIPT</div>
            <div className="font-mono text-xs text-[#6E6A5C] mt-1.5">
              <div>Date: {fmtDate(receipt.issueDate)}</div>
              <div>Receipt #: {receipt.quoteNumber}</div>
              {receipt.invoiceRef && <div>For invoice #: {receipt.invoiceRef}</div>}
            </div>
          </div>
        </div>

        <div className="border-t-2 border-[#1B2A3D] border-b border-b-[#E4DFD3] py-3 mb-6.5 text-[13.5px]">
          <div><span className={labelInlineClass}>Received from:</span> <strong>{receipt.clientName || "—"}</strong></div>
          {receipt.clientAddress && <div><span className={labelInlineClass}>Add:</span> {receipt.clientAddress}</div>}
          {receipt.clientPhone && <div><span className={labelInlineClass}>Phone:</span> {receipt.clientPhone}</div>}
        </div>

        <div className="text-center py-4.5 mb-5.5 border border-[#DAD5C6] rounded-lg bg-[#F6F2E9]">
          <div className={labelInlineClass}>Amount received</div>
          <div className="font-mono text-3xl sm:text-[34px] font-bold text-[#1B2A3D] mt-1">{money(num(receipt.amountReceived))}</div>
          <div className="text-[12.5px] text-[#6E6A5C] mt-1">via {receipt.paymentMethod}</div>
        </div>

        {balance > 0 && (
          <div className="flex justify-between text-[13.5px] px-1 mb-5.5 text-[#B5482F] font-semibold">
            <span>Balance remaining</span><span className="font-mono">{money(balance)}</span>
          </div>
        )}

        {receipt.notes && <div className="text-[13px] text-[#6E6A5C] mb-6.5 whitespace-pre-line">{receipt.notes}</div>}

        <div className="flex justify-between mt-8.5">
          <div className="text-[13px]">
            <div className="border-b border-[#C9C3B0] w-40 mb-1.5 h-7" />
            Customer
          </div>
          <div className="text-[13px] text-center">
            <div className="w-40 mb-1.5 h-7 font-display italic text-[#3D6B5C] border-b border-[#C9C3B0]">{settings.sellerName}</div>
            Received by
          </div>
        </div>

        {settings.thanksNote && <div className="text-center mt-7.5 font-semibold text-[13.5px] text-[#1B2A3D]">{settings.thanksNote}</div>}
      </div>
    </div>
  );
}
