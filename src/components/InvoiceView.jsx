"use client";

import React from "react";
import { ArrowLeft, Printer, Check, Send, X, FileText, Trash2 } from "lucide-react";
import { calcTotals, effectiveStatus, fmtDate, money, num, rowAmount } from "@/lib/helpers";
import { ActionBtn, Row, backBtnClass } from "@/components/ui/Primitives";

const labelInlineClass = "font-mono text-[10.5px] text-[#8A8574] uppercase tracking-[0.05em]";
const printThClass = "text-left font-mono text-[9.5px] tracking-[0.04em] uppercase text-[#8A8574] font-semibold pb-1.5 pr-2";
const printTdClass = "py-1.5 pr-2";

export function InvoiceView({ invoice, settings, onBack, onEdit, onStatus, onDelete, onConvert, onConvertToReceipt }) {
  const { subtotal, discount, depositAmt, total, depositMode, depositValue } = calcTotals(invoice);
  const status = effectiveStatus(invoice);
  const terms = (invoice.notes && invoice.notes.trim()) ? invoice.notes : settings.terms;
  const initials = (settings.businessName || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const isQuote = invoice.docType === "quotation";

  return (
    <div className="max-w-[820px]">
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4.5">
        <button onClick={onBack} className={backBtnClass}><ArrowLeft size={14} /> All invoices</button>
        <div className="flex gap-2 flex-wrap">
          {isQuote ? (
            <>
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status !== "accepted" && status !== "declined" && <ActionBtn icon={<Check size={13} />} label="Mark accepted" onClick={() => onStatus("accepted")} />}
              {status !== "declined" && status !== "accepted" && <ActionBtn icon={<X size={13} />} label="Mark declined" onClick={() => onStatus("declined")} />}
              {status === "accepted" && <ActionBtn icon={<FileText size={13} />} label="Convert to invoice" onClick={onConvert} />}
            </>
          ) : (
            <>
              {status !== "paid" && <ActionBtn icon={<Check size={13} />} label="Mark paid" onClick={() => onStatus("paid")} />}
              {invoice.status === "draft" && <ActionBtn icon={<Send size={13} />} label="Mark sent" onClick={() => onStatus("sent")} />}
              {status === "paid" && <ActionBtn icon={<FileText size={13} />} label="Create receipt" onClick={onConvertToReceipt} />}
            </>
          )}
          <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={() => window.print()} />
          <ActionBtn icon={<FileText size={13} />} label="Edit" onClick={onEdit} />
          <button onClick={() => { if (confirm(`Delete ${invoice.quoteNumber}?`)) onDelete(); }} className="bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[#B5482F]"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="print-sheet font-body bg-[#FFFDF9] border border-[#E4DFD3] rounded-[10px] px-5 py-8 sm:px-11 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
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
            <div className="font-display text-[28px] font-bold text-[#1B2A3D] tracking-[0.02em]">{isQuote ? "QUOTATION" : "INVOICE"}</div>
            <div className="font-mono text-xs text-[#6E6A5C] mt-1.5">
              <div>Date: {fmtDate(invoice.issueDate)}</div>
              <div>{isQuote ? "Quote #" : "Invoice #"}: {invoice.quoteNumber}</div>
              {invoice.customerId && <div>Customer ID: {invoice.customerId}</div>}
            </div>
          </div>
        </div>

        <div className="border-t-2 border-[#1B2A3D] border-b border-b-[#E4DFD3] py-3 mb-5 text-[13.5px]">
          <div><span className={labelInlineClass}>To:</span> <strong>{invoice.clientName || "—"}</strong></div>
          {invoice.clientAddress && <div><span className={labelInlineClass}>Add:</span> {invoice.clientAddress}</div>}
          {invoice.clientPhone && <div><span className={labelInlineClass}>Phone:</span> {invoice.clientPhone}</div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px] mb-1 min-w-[560px]">
            <thead>
              <tr className="border-b-2 border-[#1B2A3D]">
                <th className={`${printThClass} w-7`}>No</th>
                <th className={printThClass}>Description</th>
                <th className={printThClass}>Code</th>
                <th className={`${printThClass} text-right`}>W</th>
                <th className={`${printThClass} text-right`}>H</th>
                <th className={`${printThClass} text-right`}>Qty</th>
                <th className={`${printThClass} text-right`}>M²</th>
                <th className={`${printThClass} text-right`}>Rate/m²</th>
                <th className={`${printThClass} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return invoice.rows.map((r) =>
                  r.kind === "section" ? (
                    <tr key={r.id}>
                      <td colSpan={9} className="bg-[#DCE7F0] text-center font-semibold py-1.5 text-xs">{r.label || "—"}</td>
                    </tr>
                  ) : (
                    (() => {
                      n += 1;
                      return (
                        <tr key={r.id} className="border-b border-[#EDEAE2]">
                          <td className={printTdClass}>{n}</td>
                          <td className={printTdClass}>{r.desc}</td>
                          <td className={printTdClass}>{r.code}</td>
                          <td className={`${printTdClass} text-right`}>{r.w}</td>
                          <td className={`${printTdClass} text-right`}>{r.h}</td>
                          <td className={`${printTdClass} text-right`}>{r.qty}</td>
                          <td className={`${printTdClass} text-right`}>{r.m2}</td>
                          <td className={`${printTdClass} text-right font-mono`}>{r.rate !== "" ? money(num(r.rate)) : ""}</td>
                          <td className={`${printTdClass} text-right font-mono`}>{money(rowAmount(r))}</td>
                        </tr>
                      );
                    })()
                  )
                );
              })()}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-6 mt-4.5">
          <div className="flex-1 text-xs text-[#6E6A5C] whitespace-pre-line">
            <div className="font-bold text-[#1B2A3D] mb-1 text-[12.5px]">Terms and Condition</div>
            {terms}
          </div>
          <div className="w-full sm:w-[230px] font-mono text-[13px]">
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Discount" value={discount ? "-" + money(discount) : money(0)} />
            <Row label={depositMode === "percent" ? `Deposit ${depositValue || 0}%` : "Deposit"} value={money(depositAmt)} />
            <div className="border border-[#1B2A3D] rounded px-2.5 py-1.5 flex justify-between mt-1.5 font-bold">
              <span>Total</span><span>{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-12">
          <div className="text-[13px]">
            <div className="border-b border-[#C9C3B0] w-40 mb-1.5 h-7" />
            Buyer
          </div>
          <div className="text-[13px] text-center">
            <div className="w-40 mb-1.5 h-7 font-display italic text-[#3D6B5C] border-b border-[#C9C3B0]">{settings.sellerName}</div>
            Seller
          </div>
        </div>

        {settings.thanksNote && <div className="text-center mt-7.5 font-semibold text-[13.5px] text-[#1B2A3D]">{settings.thanksNote}</div>}
      </div>
    </div>
  );
}
