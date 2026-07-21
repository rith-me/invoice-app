"use client";

import React, { useState, useEffect } from "react";
import { Field, TextInput, inputClass } from "@/components/ui/Primitives";

export function SettingsPanel({ settings, updateSettings, showToast }) {
  const [form, setForm] = useState(settings);
  const [logoError, setLogoError] = useState("");
  useEffect(() => setForm(settings), [settings]);

  function save() {
    updateSettings(form);
    showToast("Business info saved");
  }
  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError("");
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setLogoError("Image is too large — please use one under ~3.5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoDataUrl: reader.result }));
    reader.onerror = () => setLogoError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="max-w-[480px]">
      <h1 className="font-display text-[28px] font-semibold mb-5.5">Business info</h1>
      <div className="border border-[#E4DFD3] rounded-lg p-5 bg-[#FFFDF9]">
        <Field label="Logo">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-lg border border-[#DAD5C6] bg-[#FFFDF9] flex items-center justify-center overflow-hidden shrink-0">
              {form.logoDataUrl ? (
                <img src={form.logoDataUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="font-mono text-[10px] text-[#8A8574]">none</span>
              )}
            </div>
            <div>
              <label className="inline-block bg-transparent border border-[#DAD5C6] rounded-md px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer">
                Upload image
                <input type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
              </label>
              {form.logoDataUrl && (
                <button onClick={() => setForm({ ...form, logoDataUrl: "" })} className="ml-2 bg-transparent border-none text-[#B5482F] text-[12.5px]">Remove</button>
              )}
              {logoError && <div className="text-[#B5482F] text-[11.5px] mt-1.5">{logoError}</div>}
            </div>
          </div>
        </Field>
        <Field label="Business name"><TextInput value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
        <Field label="Tagline (optional)"><TextInput value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Blinds & Curtain Solutions" /></Field>
        <Field label="Address"><textarea rows={2} className={`${inputClass} resize-y`} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Seller signature name"><TextInput value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} placeholder="Shown on the invoice signature line" /></Field>
        <Field label="Default terms & conditions">
          <textarea rows={4} className={`${inputClass} resize-y`} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </Field>
        <Field label="Footer note"><TextInput value={form.thanksNote} onChange={(e) => setForm({ ...form, thanksNote: e.target.value })} /></Field>
        <button onClick={save} className="bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold">Save</button>
      </div>
    </div>
  );
}
