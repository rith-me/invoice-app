"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InvoicingApp() {
  const router = useRouter();

  useEffect(() => {
    router.push("/invoice-app");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen w-full bg-[#FAF8F3] text-[#1B2A3D] font-body">
      <div className="font-mono text-[#8A8574] text-[13px]">Redirecting…</div>
    </div>
  );
}
