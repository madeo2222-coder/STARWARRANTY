"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

type PaymentRegistrationRow = {
  id: string;
  contract_id: string;
  payment_method: string;
  registration_status: string;
  issue_note: string | null;
  last_contacted_at: string | null;
  next_action_note: string | null;
};

export default function PaymentRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [registrationStatus, setRegistrationStatus] = useState("not_started");
  const [issueNote, setIssueNote] = useState("");
  const [lastContactedAt, setLastContactedAt] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");

  useEffect(() => {
    const fetchPaymentRegistration = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("payment_registrations")
        .select(
          "id, contract_id, payment_method, registration_status, issue_note, last_contacted_at, next_action_note"
        )
        .eq("contract_id", contractId)
        .maybeSingle();

      if (error) {
        console.error("決済登録進捗取得エラー:", error);
        setLoading(false);
        return;
      }

      const row = (data ?? null) as PaymentRegistrationRow | null;

      if (row) {
        setExistingId(row.id);
        setPaymentMethod(row.payment_method || "credit");
        setRegistrationStatus(row.registration_status || "not_started");
        setIssueNote(row.issue_note || "");
        setLastContactedAt(row.last_contacted_at || "");
        setNextActionNote(row.next_action_note || "");
      }

      setLoading(false);
    };

    if (contractId) {
      void fetchPaymentRegistration();
    }
  }, [contractId]);

  const handleSave = async () => {
    setSaving(true);

    if (existingId) {
      const { error } = await supabase
        .from("payment_registrations")
        .update({
          payment_method: paymentMethod,
          registration_status: registrationStatus,
          issue_note: issueNote.trim() || null,
          last_contacted_at: lastContactedAt || null,
          next_action_note: nextActionNote.trim() || null,
        })
        .eq("id", existingId);

      if (error) {
        console.error("更新エラー:", error);
        alert("更新に失敗しました");
        setSaving(false);
        return;
      }

      alert("更新しました");
    } else {
      const { error } = await supabase.from("payment_registrations").insert({
        contract_id: contractId,
        payment_method: paymentMethod,
        registration_status: registrationStatus,
        issue_note: issueNote.trim() || null,
        last_contacted_at: lastContactedAt || null,
        next_action_note: nextActionNote.trim() || null,
      });

      if (error) {
        console.error("登録エラー:", error);
        alert("登録に失敗しました");
        setSaving(false);
        return;
      }

      alert("登録しました");
    }

    setSaving(false);
    router.push("/contracts");
    router.refresh();
  };

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
      <h1 className="text-xl font-bold">決済登録進捗の登録・更新</h1>

      <div>
        <label className="mb-1 block text-sm font-medium">決済手段</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded border p-2"
        >
          <option value="credit">クレカ</option>
          <option value="bank_transfer">口座振替</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">登録進捗</label>
        <select
          value={registrationStatus}
          onChange={(e) => setRegistrationStatus(e.target.value)}
          className="w-full rounded border p-2"
        >
          <option value="not_started">未着手</option>
          <option value="sent">案内送信済み</option>
          <option value="customer_pending">顧客対応中</option>
          <option value="documents_collected">書類回収済み</option>
          <option value="submitted">送付済み</option>
          <option value="incomplete">不備あり</option>
          <option value="retrying">再対応中</option>
          <option value="completed">登録完了</option>
          <option value="cancelled">キャンセル</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">不備メモ</label>
        <textarea
          value={issueNote}
          onChange={(e) => setIssueNote(e.target.value)}
          className="w-full rounded border p-2"
          rows={4}
          placeholder="例：印鑑相違、口座番号不備 など"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">最終対応日</label>
        <input
          type="date"
          value={lastContactedAt}
          onChange={(e) => setLastContactedAt(e.target.value)}
          className="w-full rounded border p-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">次回対応メモ</label>
        <textarea
          value={nextActionNote}
          onChange={(e) => setNextActionNote(e.target.value)}
          className="w-full rounded border p-2"
          rows={4}
          placeholder="例：3/31に再架電、LINE再送、用紙再送 など"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded border px-4 py-2 text-sm font-medium"
        >
          {saving ? "保存中..." : "保存する"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/contracts")}
          className="rounded border px-4 py-2 text-sm"
        >
          戻る
        </button>
      </div>
    </div>
  );
}