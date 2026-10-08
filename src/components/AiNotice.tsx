export function AiNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-3 rounded-[var(--radius)] bg-warm-soft px-4 py-3 text-[13px] text-ink leading-relaxed max-w-[64ch]"><span className="font-semibold text-warm">AI：</span>{message}</p>;
}
