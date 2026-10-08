"use client";
export function PrintButton({ label = "印刷用（PDF保存）" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-text -ml-1.5 print:hidden">⎙ {label}</button>;
}
