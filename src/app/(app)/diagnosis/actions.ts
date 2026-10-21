"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators, notifyCustomer } from "@/server/notify";
import { fmtMeeting } from "@/lib/meetings";

/** 顧客が「申し込む」を押す → 申込日時を記録し、ベレネッツに知らせる（契約書・請求書はアプリ外で送る） */
export async function applyProgram() {
  const { company, user, profile } = await requireCustomer();
  const admin = createAdminClient();
  // 契約前で、結果が公開されていて、閲覧期限内のときだけ受け付ける
  if (company.status !== "diagnosed") { revalidatePath("/diagnosis"); return; }
  const { data: dr } = await admin.from("diagnosis_results").select("published_at, expires_at").eq("company_id", company.id).maybeSingle();
  if (!dr?.published_at || (dr.expires_at && new Date(dr.expires_at) < new Date())) { revalidatePath("/diagnosis"); return; }
  // 二度押しでも1回だけ：まだ申込が入っていない行だけを更新し、更新できたときだけ知らせる
  const { data: won } = await admin.from("companies").update({ applied_at: new Date().toISOString() }).eq("id", company.id).is("applied_at", null).select("id");
  if (!won?.length) {
    revalidatePath("/diagnosis");
    return;
  }
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "program_applied", by: user.id } });
  // 押した本人に受付メール
  if (user.email) {
    await notifyCustomer({
      to: user.email,
      subject: "お申し込みを受け付けました",
      lines: [
        `${company.name}`,
        `${profile.display_name && profile.display_name !== user.email ? `${profile.display_name} 様` : "ご担当者様"}`,
        "",
        "お申し込みを受け付けました。",
        "2営業日以内に申込書・契約書と請求書をお送りします。",
        "この時点で費用は発生していませんのでご安心ください。",
        "",
        "株式会社ベレネッツ",
      ],
      path: "/diagnosis",
    });
  }
  await notifyOperators({ subject: `${company.name} から申込がありました`, lines: [`${company.name} の担当者が、診断結果ページで「このプログラムに申し込む」を押しました。`, "申込書・契約書と請求書をメールでお送りください。契約・入金を確認したら、管理画面で「契約済」「入金済」を記録してください。"], path: `/admin/${company.id}` });
  revalidatePath("/diagnosis");
}

/** 顧客がキックオフ候補日を選ぶ（契約・入金の確認後のみ） → 面談として登録し、ベレネッツに知らせる */
export async function chooseKickoff(formData: FormData) {
  const { company, user } = await requireCustomer();
  const iso = String(formData.get("date") || "");
  // キックオフ日を選ぶのは契約前（diagnosed）の会社だけ
  if (company.status !== "diagnosed") return;
  const admin = createAdminClient();
  const { data: c } = await admin.from("companies").select("paid_at").eq("id", company.id).single();
  if (!c?.paid_at) return;
  // 候補は、結果ページの候補日と、面談に登録した未実施のキックオフの両方（過ぎた日は選べない）
  const { loadKickoff } = await import("@/server/kickoff");
  const k = await loadKickoff(company.id);
  if (k.chosen || !k.candidates.includes(iso) || new Date(iso) <= new Date()) {
    revalidatePath("/diagnosis");
    return;
  }
  // 二度押しでも1回だけ：まだ選ばれていないときだけ書き込み、書き込めた側だけが先へ進む
  const chosenAt = new Date().toISOString();
  const { data: won } = await admin.from("diagnosis_results").update({ chosen_date: iso, chosen_at: chosenAt }).eq("company_id", company.id).is("chosen_date", null).select("company_id");
  if (!won?.length) {
    // 結果の行がまだ無い（候補が面談にだけある）ときは作る。同時に2回来ても、会社ごとに1行なので片方は失敗して止まる
    const { error } = await admin.from("diagnosis_results").insert({ company_id: company.id, chosen_date: iso, chosen_at: chosenAt });
    if (error) { revalidatePath("/diagnosis"); return; }
  }
  // 面談のキックオフ：選んだ日時のものがあればそれを残し（会議URLは残る）、ほかの未実施の候補は外す。無ければ1件作る
  const { data: kms } = await admin.from("company_meetings").select("id, scheduled_at").eq("company_id", company.id).eq("kind", "kickoff").is("held_at", null);
  const same = (kms ?? []).find((m) => new Date(m.scheduled_at as string).getTime() === new Date(iso).getTime());
  const others = (kms ?? []).filter((m) => m.id !== same?.id && new Date(m.scheduled_at as string).getTime() > Date.now());
  if (same) {
    if (others.length) await admin.from("company_meetings").delete().in("id", others.map((m) => m.id));
  } else {
    const first = (kms ?? [])[0];
    if (first) {
      await admin.from("company_meetings").update({ scheduled_at: iso }).eq("id", first.id);
      const rest = (kms ?? []).slice(1).filter((m) => new Date(m.scheduled_at as string).getTime() > Date.now());
      if (rest.length) await admin.from("company_meetings").delete().in("id", rest.map((m) => m.id));
    } else {
      await admin.from("company_meetings").insert({ company_id: company.id, kind: "kickoff", scheduled_at: iso, created_by: user.id });
    }
  }
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "kickoff_chosen", date: iso, by: user.id } });
  await notifyOperators({ subject: `${company.name} がキックオフ日を選びました（${fmtMeeting(iso)}）`, lines: [`${company.name} の担当者が、キックオフの日程を ${fmtMeeting(iso)} に決めました。`, "面談に会議URLを入れ、状態を「キックオフ前」に変えると STEP 0 が開きます。"], path: `/admin/${company.id}` });
  revalidatePath("/diagnosis");
  revalidatePath("/");
}

/** 顧客が診断結果ページを開いた記録。開くたびにベレネッツに通知する（10分以内の連続表示は1回と数える） */
export async function recordDiagnosisView() {
  const { company, user, profile } = await requireCustomer();
  const admin = createAdminClient();
  // 契約後に開いたときは、閲覧の記録・通知をしない（申込前の検討状況を知るための記録のため）
  if (company.status !== "diagnosed") return;
  const { data: d } = await admin.from("diagnosis_results").select("first_viewed_at, last_viewed_at, view_count, published_at").eq("company_id", company.id).maybeSingle();
  if (!d || !d.published_at) return;
  const now = new Date();
  const last = d.last_viewed_at ? new Date(d.last_viewed_at) : null;
  if (last && now.getTime() - last.getTime() < 10 * 60 * 1000) {
    await admin.from("diagnosis_results").update({ last_viewed_at: now.toISOString() }).eq("company_id", company.id);
    return;
  }
  const count = (d.view_count ?? 0) + 1;
  await admin.from("diagnosis_results").update({ first_viewed_at: d.first_viewed_at ?? now.toISOString(), last_viewed_at: now.toISOString(), view_count: count }).eq("company_id", company.id);
  if (!d.first_viewed_at && company.status === "diagnosed") await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "diagnosis_viewed", by: user.id } });
  const who = profile.display_name ?? "担当者";
  await notifyOperators({
    subject: count === 1 ? `${company.name} が適合診断の結果を開きました` : `${company.name} が適合診断の結果を再び開きました（${count}回目）`,
    lines: [
      count === 1 ? `${company.name} の ${who} さんが、適合診断の結果ページを初めて開きました。` : `${company.name} の ${who} さんが、適合診断の結果ページをもう一度開きました（${count}回目${d.first_viewed_at ? `、初回は ${fmtMeeting(d.first_viewed_at)}` : ""}）。`,
      count >= 3 ? "何度も読み返しています。迷っている点があるかもしれません。ひと声かける頃合いです。" : "申込ボタンが押されると、別途お知らせします。",
    ],
    path: `/admin/${company.id}`,
  });
}
