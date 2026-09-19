import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { bankPay } from "../../api/client";
import { vnd } from "../../lib/format";

export default function BankDemo() {
  const [sp] = useSearchParams();
  const code = sp.get("code") || "HD20260827-0001";
  const amount = Number(sp.get("amount") || 52000);
  const [done, setDone] = useState<any>(null);
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a3d62] to-[#012a4a] text-white p-6">
      <div className="max-w-sm mx-auto mt-10 card bg-white text-ink-900 p-6">
        <div className="text-center text-xs text-ink-400">NGÂN HÀNG MÔ PHỎNG</div>
        <h1 className="font-display font-black text-2xl text-center mt-1">Vietcombank Demo</h1>
        <div className="mt-6 space-y-2 text-sm">
          <Row k="Thụ hưởng" v="TAP HOA LAM" />
          <Row k="STK" v="0123456789" />
          <Row k="Số tiền" v={vnd(amount)} />
          <Row k="Nội dung" v={code} />
        </div>
        <button
          className="btn-coral w-full mt-6"
          onClick={async () => setDone(await bankPay(code, amount))}
        >
          Chuyển khoản
        </button>
        {done && <p className="text-center text-lime-700 mt-3 font-semibold">{done.matched ? "Khớp đơn " + done.order_code : "Đã gửi, chưa khớp"}</p>}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-2">
      <span className="text-ink-400">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
