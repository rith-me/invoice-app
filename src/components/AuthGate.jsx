"use client";

import React, { useState } from "react";
import { TextInput } from "@/components/ui/Primitives";

/**
 * Renders nothing (returns null) if the app shouldn't be locked right now.
 * Otherwise renders a full-screen PIN or username/password gate and calls
 * onUnlock(user) once the person gets past it. `user` is null for PIN mode.
 */
export function AuthGate({ settings, unlocked, onUnlock, onDisablePin, onDisableUsers }) {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [showForgotLogin, setShowForgotLogin] = useState(false);

  if (unlocked) return null;

  if (settings.authMode === "users" && (settings.users || []).length > 0) {
    const submitLogin = () => {
      const match = settings.users.find(
        (u) => u.username.trim().toLowerCase() === loginUsername.trim().toLowerCase() && u.password === loginPassword
      );
      if (match) {
        onUnlock(match);
      } else {
        setLoginError(true);
        setLoginPassword("");
      }
    };
    return (
      <div className="flex items-center justify-center flex-col h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
        <div className="w-[280px] text-center">
          <div className="font-display text-2xl font-semibold text-[#1B2A3D] mb-1">{settings.businessName}</div>
          <div className="font-mono text-[11.5px] text-[#8A8574] mb-5">Sign in to continue</div>
          <div className="text-left mb-3">
            <TextInput
              autoFocus
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setLoginError(false); }}
              placeholder="Username"
              className={`mb-2.5 ${loginError ? "border-[#B5482F]" : ""}`}
            />
            <TextInput
              type="password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setLoginError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitLogin(); }}
              placeholder="Password"
              className={loginError ? "border-[#B5482F]" : ""}
            />
          </div>
          {loginError && <div className="text-[#B5482F] text-xs mb-2.5">Incorrect username or password</div>}
          <button onClick={submitLogin} className="w-full bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2.5 rounded-md text-[13.5px] font-semibold">
            Sign in
          </button>

          {!showForgotLogin ? (
            <button onClick={() => setShowForgotLogin(true)} className="bg-transparent border-none text-[#8A8574] text-xs mt-3.5 underline">
              Forgot password?
            </button>
          ) : (
            <div className="mt-4 p-3.5 border border-[#E4DFD3] rounded-md bg-[#FFFDF9] text-left">
              <div className="text-xs text-[#6E6A5C] mb-2.5">This turns off login requirements so you can get back in. Your data isn't affected — you can manage accounts again from Business info afterward.</div>
              <div className="flex gap-2">
                <button onClick={() => setShowForgotLogin(false)} className="flex-1 bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px]">Cancel</button>
                <button
                  onClick={() => {
                    onDisableUsers();
                    setShowForgotLogin(false);
                    setLoginUsername("");
                    setLoginPassword("");
                    setLoginError(false);
                  }}
                  className="flex-1 bg-[#B5482F] text-[#FAF8F3] border-none rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold"
                >
                  Turn off login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (settings.authMode !== "users" && settings.pinCode) {
    const submitPin = () => {
      if (pinInput === settings.pinCode) onUnlock(null);
      else { setPinError(true); setPinInput(""); }
    };
    return (
      <div className="flex items-center justify-center flex-col h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
        <div className="w-[260px] text-center">
          <div className="font-display text-2xl font-semibold text-[#1B2A3D] mb-1">{settings.businessName}</div>
          <div className="font-mono text-[11.5px] text-[#8A8574] mb-5">Enter PIN to continue</div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
            className={`font-body w-full box-border border rounded text-[#1B2A3D] bg-[#FFFDF9] px-2.5 py-2 text-center text-xl tracking-[0.3em] mb-2.5 outline-none ${pinError ? "border-[#B5482F]" : "border-[#DAD5C6]"}`}
            placeholder="••••"
          />
          {pinError && <div className="text-[#B5482F] text-xs mb-2.5">Incorrect PIN</div>}
          <button onClick={submitPin} className="w-full bg-[#1B2A3D] text-[#FAF8F3] border-none px-4 py-2.5 rounded-md text-[13.5px] font-semibold">
            Unlock
          </button>

          {!showForgotPin ? (
            <button onClick={() => setShowForgotPin(true)} className="bg-transparent border-none text-[#8A8574] text-xs mt-3.5 underline">
              Forgot PIN?
            </button>
          ) : (
            <div className="mt-4 p-3.5 border border-[#E4DFD3] rounded-md bg-[#FFFDF9] text-left">
              <div className="text-xs text-[#6E6A5C] mb-2.5">This removes the PIN lock so you can get back in. Your data isn't affected — you can set a new PIN afterward from Business info.</div>
              <div className="flex gap-2">
                <button onClick={() => setShowForgotPin(false)} className="flex-1 bg-transparent border border-[#DAD5C6] rounded-md px-2.5 py-1.5 text-[12.5px]">Cancel</button>
                <button
                  onClick={() => {
                    onDisablePin();
                    setShowForgotPin(false);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="flex-1 bg-[#B5482F] text-[#FAF8F3] border-none rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold"
                >
                  Remove PIN
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
