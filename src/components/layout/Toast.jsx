"use client";

import React from "react";

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="no-print font-mono fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1B2A3D] text-[#FAF8F3] px-4.5 py-2 rounded-md text-[12.5px] shadow-[0_6px_20px_rgba(0,0,0,0.2)] z-50 max-w-[90vw] text-center">
      {message}
    </div>
  );
}
