"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareUpload, finishUpload } from "@/app/(app)/step0/actions";
import { FilePicker } from "@/components/FilePicker";

/** STEP 0 の資料アップロード。ブラウザから保管場所へ直接送る（25MBまで） */
export function DirectUploadForm({ disabled, kindSelect, accept }: { disabled: boolean; kindSelect: ReactNode; accept: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  return (
    <form
      data-no-busy="1"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const file = fd.get("file");
        if (!(file instanceof File) || file.size === 0) { setError("ファイルを選んでください。"); return; }
        setError("");
        setState("sending");
        try {
          const prep = await prepareUpload({ name: file.name, size: file.size, type: file.type });
          if (!prep.ok) throw new Error(prep.error);
          const { error: upErr } = await createClient().storage.from("company-docs").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
          if (upErr) throw new Error("送れませんでした。通信を確かめて、もう一度お試しください。");
          const done = new FormData();
          done.set("path", prep.path);
          done.set("title", String(fd.get("title") || ""));
          done.set("kind", String(fd.get("kind") || "other"));
          done.set("file_name", file.name);
          done.set("file_type", file.type);
          done.set("file_size", String(file.size));
          const fin = await finishUpload(done);
          if (!fin.ok) throw new Error(fin.error ?? "登録できませんでした。");
          form.reset();
          setResetKey((k) => k + 1);
          setState("done");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "登録できませんでした。");
          setState("idle");
        }
      }}
    >
      <FilePicker key={resetKey} name="file" accept={accept} hint="PDF・画像（PNG/JPG）・テキスト。1ファイル25MBまで。画像は保管のみで、AIは文字を読みません" />
      <input name="title" placeholder="名前（空ならファイル名）" className="block w-full border-b hairline py-2 text-sm" />
      {kindSelect}
      <button className="btn-primary block" type="submit" disabled={disabled || state === "sending"}>{state === "sending" ? "送っています…" : "上げる"}</button>
      {error && <p className="text-[12px] text-warm">{error}</p>}
      {state === "done" && !error && <p className="text-[12px] text-navy">登録しました。</p>}
    </form>
  );
}
