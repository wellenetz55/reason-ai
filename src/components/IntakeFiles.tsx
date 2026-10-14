"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareIntakeFile, finishIntakeFile, removeIntakeFile, type IntakeFile } from "@/app/(admin)/admin/[companyId]/intake/fileActions";

/** 保管場所が受け付ける形式に合わせて送る（テキスト類は text/plain にそろえる。拡張子で決めるので、OSが形式を付けないファイルも通る） */
function contentTypeOf(f: File): string {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (["txt", "md", "vtt", "srt", "csv", "tsv"].includes(ext)) return "text/plain";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  return f.type || "application/octet-stream";
}

const kb = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/**
 * 面談メモ・資料を複数まとめて登録する。選んだらすぐ送る（ページを読み直さないので、上で入力中の記録は消えない）。
 */
export function IntakeFiles({ companyId, initial }: { companyId: string; initial: IntakeFile[] }) {
  const [files, setFiles] = useState<IntakeFile[]>(initial);
  const [busy, setBusy] = useState<string>("");
  const [msgs, setMsgs] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string>("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(list: File[]) {
    if (!list.length || busy) return;
    const notes: string[] = [];
    for (const [i, f] of list.entries()) {
      setBusy(`送っています（${i + 1}/${list.length}）：${f.name}`);
      try {
        const prep = await prepareIntakeFile({ companyId, name: f.name, size: f.size });
        if (!prep.ok) { notes.push(prep.error); continue; }
        const { error } = await createClient().storage.from("company-docs").uploadToSignedUrl(prep.path, prep.token, f, { contentType: contentTypeOf(f) });
        if (error) {
          const m = error.message ?? "";
          notes.push(/mime|type/i.test(m) ? `${f.name}：この形式は保管場所の設定でまだ受け付けていません（${contentTypeOf(f)}）` : /size|large/i.test(m) ? `${f.name}：大きすぎます（25MBまで）` : `${f.name}：送れませんでした（${m || "通信エラー"}）。もう一度お試しください`);
          continue;
        }
        const fin = await finishIntakeFile({ companyId, path: prep.path, name: f.name, type: contentTypeOf(f) });
        if (!fin.ok) { notes.push(fin.error); continue; }
        setFiles((x) => [...x, fin.file]);
        if (fin.note) notes.push(fin.note);
      } catch {
        notes.push(`${f.name}：登録できませんでした。通信を確かめて、もう一度お試しください`);
      }
    }
    setBusy("");
    setMsgs(notes.length ? notes : [`${list.length}件を登録しました。`]);
    if (input.current) input.current.value = "";
  }

  async function remove(id: string) {
    setConfirmId("");
    const r = await removeIntakeFile({ companyId, id });
    if (r.ok) setFiles((x) => x.filter((f) => f.id !== id));
    else setMsgs([`外せませんでした：${r.error ?? ""}`]);
  }

  return (
    <div className="space-y-3">
      <label
        className={`block cursor-pointer rounded-[var(--radius)] border-2 border-dashed px-5 py-6 text-center transition-colors ${over ? "border-navy bg-navy-soft" : "border-navy/40 bg-navy-soft hover:border-navy"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send([...e.dataTransfer.files]); }}
      >
        <input ref={input} type="file" multiple className="sr-only" accept=".txt,.md,.vtt,.srt,.csv,.tsv,.pdf,.docx,.png,.jpg,.jpeg,.heic,.webp" onChange={(e) => send([...(e.target.files ?? [])])} />
        <Upload size={22} strokeWidth={1.75} className="mx-auto text-navy" aria-hidden />
        <p className="mt-2 text-[14px] font-semibold text-navy">{busy || "ここを押してファイルを選ぶ（複数まとめて選べます）／ここにドラッグ"}</p>
        <p className="text-[12px] text-ink-3 mt-1">テキスト・PDF・Word(.docx)・画像。1ファイル25MBまで。選ぶとすぐ登録します（上で入力中の内容は消えません）。画像は保管のみで、AIは文字を読みません</p>
      </label>
      {msgs.length > 0 && <ul className="text-[12px] space-y-0.5">{msgs.map((m, i) => <li key={i} className={/登録しました/.test(m) ? "text-navy" : "text-warm"}>{m}</li>)}</ul>}
      {files.length > 0 ? (
        <ul className="divide-y divide-hair text-sm border-y hairline">
          {files.map((f) => (
            <li key={f.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`/api/admin/file?path=${encodeURIComponent(f.storage_path)}`} target="_blank" rel="noopener" className="underline underline-offset-4 break-all">{f.name}</a>
              <span className="num text-[12px] text-ink-3">{kb(f.size_bytes)}</span>
              <span className="text-[12px] text-ink-3">{f.chars ? `文字 ${f.chars.toLocaleString()} 字（AIの材料）` : "保管のみ（文字なし）"}</span>
              <span className="ml-auto">
                {confirmId === f.id ? (
                  <span className="inline-flex items-center gap-2 text-[12px]">本当に外しますか？
                    <button type="button" className="btn-text text-xs text-warm" onClick={() => remove(f.id)}>外す</button>
                    <button type="button" className="btn-text text-xs" onClick={() => setConfirmId("")}>やめる</button>
                  </span>
                ) : (
                  <button type="button" className="btn-text text-xs" onClick={() => setConfirmId(f.id)}>外す</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">まだ登録されていません。</p>}
    </div>
  );
}
