"use client";

import React, { useState, useEffect, useRef } from "react";
import { Trash2, Download, Upload } from "lucide-react";
import { uid, todayISO } from "@/lib/helpers";
import { Field, TextInput, inputClass } from "@/components/ui/Primitives";

const cardClass = "border border-[#E4DFD3] rounded-lg p-5 bg-[#FFFDF9] mb-4.5";
const sectionTitleClass = "font-display text-[17px] font-semibold mb-1.5";
const saveBtnClass = "bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2 rounded-md text-[13.5px] font-semibold";
const toggleClass = "flex items-center gap-2 bg-transparent border border-[#DAD5C6] rounded px-2.5 py-2 text-[13.5px] w-full";

function Toggle({ on }) {
  return (
    <span className={`w-8 h-[18px] rounded-full relative shrink-0 ${on ? "bg-[#3D6B5C]" : "bg-[#DAD5C6]"}`}>
      <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-[#FFFDF9] transition-all" style={{ left: on ? 16 : 2 }} />
    </span>
  );
}

export function SettingsPanel({ settings, updateSettings, showToast, allData, onImportAll }) {
  const [form, setForm] = useState(settings);
  const [prevSettings, setPrevSettings] = useState(settings);
  const [logoError, setLogoError] = useState("");
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", username: "", password: "" });
  const [userError, setUserError] = useState("");
  const fileInputRef = useRef(null);

  // Sync local form state from the `settings` prop without an effect —
  // adjust state during render (see https://react.dev/learn/you-might-not-need-an-effect)
  if (settings !== prevSettings) {
    setPrevSettings(settings);
    setForm(settings);
  }

  // ...rest of component unchanged
  function save() {
    updateSettings(form);
    showToast("Business info saved");
  }
  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError("");
    if (!file.type.startsWith("image/")) { setLogoError("Please choose an image file."); return; }
    if (file.size > 3.5 * 1024 * 1024) { setLogoError("Image is too large — please use one under ~3.5MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoDataUrl: reader.result }));
    reader.onerror = () => setLogoError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  }
  function exportBackup() {
    const payload = { exportedAt: new Date().toISOString(), ...allData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ctl-cloud-backup_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  }
  function addUser() {
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      setUserError("Fill in name, username, and password.");
      return;
    }
    if ((form.users || []).some((u) => u.username.trim().toLowerCase() === newUser.username.trim().toLowerCase())) {
      setUserError("That username is already taken.");
      return;
    }
    const nextUsers = [...(form.users || []), { id: uid(), ...newUser }];
    setForm({ ...form, users: nextUsers });
    updateSettings({ ...form, users: nextUsers });
    setNewUser({ name: "", username: "", password: "" });
    setUserError("");
    showToast("User added");
  }
  function removeUser(id) {
    const nextUsers = (form.users || []).filter((u) => u.id !== id);
    setForm({ ...form, users: nextUsers });
    updateSettings({ ...form, users: nextUsers });
  }
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPendingImport(JSON.parse(String(reader.result || "{}")));
      } catch (err) {
        setImportError("Couldn't read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-[520px]">
      <h1 className="font-display text-[28px] font-semibold mb-5.5">Business info</h1>

      <div className={cardClass}>
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
        <Field label="Default terms & conditions"><textarea rows={4} className={`${inputClass} resize-y`} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field>
        <Field label="Footer note"><TextInput value={form.thanksNote} onChange={(e) => setForm({ ...form, thanksNote: e.target.value })} /></Field>
        <button onClick={save} className={saveBtnClass}>Save</button>
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>Currency</div>
        <div className="flex gap-4">
          <div className="flex-1"><Field label="USD → KHR rate"><TextInput type="number" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} /></Field></div>
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-[#8A8574] mb-1.5">Show KHR on documents</div>
            <button onClick={() => setForm({ ...form, showKHR: !form.showKHR })} className={toggleClass}>
              <Toggle on={form.showKHR} />
              {form.showKHR ? "On" : "Off"}
            </button>
          </div>
        </div>
        <button onClick={save} className={`${saveBtnClass} mt-1`}>Save</button>
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>KHQR payment</div>
        <div className="text-[12.5px] text-[#8A8574] mb-3">Paste the payment string from your bank/Bakong KHQR (not a screenshot — the raw text/code your bank app can export). A scannable QR will be shown on invoices so clients can pay you directly.</div>
        <Field label="KHQR payload"><textarea rows={3} className={`${inputClass} resize-y font-mono text-[11.5px]`} value={form.khqrPayload} onChange={(e) => setForm({ ...form, khqrPayload: e.target.value })} placeholder="00020101021129..." /></Field>
        <button onClick={save} className={saveBtnClass}>Save</button>
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>App lock</div>
        <div className="text-[12.5px] text-[#8A8574] mb-3.5">Require unlocking this app each time it is opened. This is a basic deterrent, not real security — anyone with access to your browser's data could still bypass it.</div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[["none", "No lock"], ["pin", "PIN"], ["users", "User logins"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { const next = { ...form, authMode: key }; setForm(next); updateSettings(next); }}
              className={`border border-[#DAD5C6] rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold ${(form.authMode || "none") === key ? "bg-[#1B2A3D] text-[#FAF8F3]" : "bg-transparent text-[#6E6A5C]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {form.authMode === "pin" && (
          <>
            <Field label="PIN"><TextInput type="password" inputMode="numeric" value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} placeholder="e.g. 1234" /></Field>
            <button onClick={save} className={saveBtnClass}>Save</button>
          </>
        )}

        {form.authMode === "users" && (
          <>
            <div className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-[#8A8574] mb-2">Accounts</div>
            {(form.users || []).length > 0 && (
              <div className="flex flex-col gap-2 mb-3.5">
                {form.users.map((u) => (
                  <div key={u.id} className="flex justify-between items-center border border-[#E4DFD3] rounded-md px-3 py-2">
                    <div>
                      <div className="font-semibold text-[13.5px]">{u.name}</div>
                      <div className="text-xs text-[#8A8574]">@{u.username}</div>
                    </div>
                    <button onClick={() => removeUser(u.id)} className="bg-transparent border-none text-[#B5482F]"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <TextInput value={newUser.name} onChange={(e) => { setNewUser({ ...newUser, name: e.target.value }); setUserError(""); }} placeholder="Name" />
              <TextInput value={newUser.username} onChange={(e) => { setNewUser({ ...newUser, username: e.target.value }); setUserError(""); }} placeholder="Username" />
              <TextInput type="password" value={newUser.password} onChange={(e) => { setNewUser({ ...newUser, password: e.target.value }); setUserError(""); }} placeholder="Password" />
            </div>
            {userError && <div className="text-[#B5482F] text-xs mt-1.5">{userError}</div>}
            <button onClick={addUser} className={`${saveBtnClass} mt-2.5`}>Add user</button>
            {(form.users || []).length === 0 && <div className="text-xs text-[#8A8574] mt-2">Add at least one user above for the login screen to appear.</div>}
          </>
        )}
      </div>

      <div className={cardClass}>
        <div className={sectionTitleClass}>Backup &amp; restore</div>
        <div className="text-[12.5px] text-[#8A8574] mb-3.5">Download everything — clients, invoices, quotations, receipts, purchase orders, items, expenses, and schedule — as one file. Keep it somewhere safe.</div>
        <div className="flex gap-2 mb-2.5 flex-wrap">
          <button onClick={exportBackup} className="flex items-center gap-1.5 bg-[#1B2A3D] text-[#FAF8F3] border-none px-3.5 py-2 rounded-md text-[13px] font-semibold">
            <Download size={14} /> Export backup
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 bg-transparent border border-[#DAD5C6] px-3.5 py-2 rounded-md text-[13px] font-semibold">
            <Upload size={14} /> Restore from backup
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
        </div>
        {pendingImport && (
          <div className="flex items-center justify-between bg-[#F5E4DE] border border-[#E3B8A8] rounded-md px-3.5 py-2.5 mb-2.5 flex-wrap gap-2">
            <span className="text-[12.5px] text-[#8A3A22]">This will replace all current data with the backup file. Continue?</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setPendingImport(null)} className="bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px]">Cancel</button>
              <button onClick={() => { onImportAll(pendingImport); setPendingImport(null); }} className="bg-[#B5482F] text-[#FAF8F3] border-none rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold">
                Yes, restore
              </button>
            </div>
          </div>
        )}
        {importError && <div className="text-[#B5482F] text-xs">{importError}</div>}
      </div>
    </div>
  );
}
