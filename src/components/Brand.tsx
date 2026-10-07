import Image from "next/image";

export function ReasonLogo({ width = 220, className = "" }: { width?: number; className?: string }) {
  return <Image src="/logo-reason-ai.png" alt="選ばれる理由AI" width={width} height={Math.round(width * 147 / 1104)} priority className={className} />;
}

export function OperatedBy({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-[11px] text-ink-3 ${className}`}>
      <span>運営</span>
      <Image src="/logo-wellenetz.png" alt="wellenetz" width={96} height={11} />
    </p>
  );
}
