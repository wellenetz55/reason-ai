import Image from "next/image";

export function ReasonLogo({ width = 220, className = "" }: { width?: number; className?: string }) {
  return <Image src="/logo-reason-ai.png" alt="選ばれる理由AI" width={width} height={Math.round(width * 147 / 1104)} priority className={className} />;
}

export function OperatedBy({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2.5 text-[12px] text-ink-3 ${className}`}>
      <span>運営</span>
      <a href="https://www.wellenetz.co.jp/" target="_blank" rel="noopener noreferrer" title="株式会社ベレネッツ" className="hover:opacity-70 transition-opacity">
        <Image src="/logo-wellenetz.png" alt="wellenetz" width={150} height={17} />
      </a>
    </p>
  );
}
