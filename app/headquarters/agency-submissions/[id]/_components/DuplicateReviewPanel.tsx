"use client";

import { useState } from "react";
import type {
  DuplicateReviewContext,
  DuplicateReviewDecision,
  DuplicateReviewRow,
} from "@/lib/submission-center/duplicate-review";

type Props = {
  contexts: DuplicateReviewContext[];
  canUpdate: boolean;
  submittingRowId: string | null;
  onReview: (
    rowId: string,
    decision: DuplicateReviewDecision,
    note: string
  ) => Promise<void>;
};

const SEPARATE_REASONS = [
  "同姓同名だが設置住所が異なる",
  "同じ顧客の別物件",
  "同じ住所だが別設備",
  "保証開始日および対象機器が異なる",
  "過去申込の取消後に再申込",
  "その他",
];

const EXCLUDE_REASONS = [
  "同一Excelを再送信",
  "同一顧客、同一住所、同一設備、同一保証開始日",
  "提出元による二重送信",
  "その他",
];

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatYen(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function RowDetails({ row }: { row: DuplicateReviewRow }) {
  const items = [
    ["シート名", row.sheet_name],
    ["行番号", row.row_number],
    ["顧客名", row.customer_name],
    ["郵便番号", row.postal_code],
    ["住所", row.address_full],
    ["電話番号", row.phone],
    ["メール", row.email],
    ["保証開始日", row.warranty_start_date],
    ["プラン", row.plan_code],
    ["給湯器種類", row.water_heater_type],
    ["追加機器", row.additional_equipment],
    ["追加台数", row.additional_quantity],
    ["メーカー", row.manufacturer],
    ["型番", row.model_number],
    ["商品名", row.equipment_name],
    ["数量", row.quantity],
  ] as const;

  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="text-gray-500">{label}</dt>
          <dd className="break-words font-medium text-gray-900">
            {formatValue(value)}
          </dd>
        </div>
      ))}
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <dt className="text-gray-500">保証料</dt>
        <dd className="font-medium text-gray-900">{formatYen(row.warranty_fee)}</dd>
      </div>
    </dl>
  );
}

function ReviewCard({
  context,
  canUpdate,
  submittingRowId,
  onReview,
}: {
  context: DuplicateReviewContext;
  canUpdate: boolean;
  submittingRowId: string | null;
  onReview: Props["onReview"];
}) {
  const [decision, setDecision] = useState<DuplicateReviewDecision>("separate");
  const [note, setNote] = useState("");
  const busy = submittingRowId === context.current.row.id;
  const reasonOptions = decision === "separate" ? SEPARATE_REASONS : EXCLUDE_REASONS;

  async function submit() {
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      window.alert("判断理由を入力してください。");
      return;
    }
    const label = decision === "separate" ? "別加入として承認" : "重複として除外";
    const detail =
      decision === "separate"
        ? "承認後はAuto Register対象になります。"
        : "除外後は保証書・請求書の登録対象から外れます。";
    if (!window.confirm(`この行を「${label}」します。\n${detail}\nよろしいですか。`)) {
      return;
    }
    await onReview(context.current.row.id, decision, normalizedNote);
  }

  return (
    <article className="space-y-5 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-orange-800">
            {context.current.row.duplicate_status === "duplicate"
              ? "重複候補"
              : "要重複確認"}
          </div>
          <h3 className="mt-1 text-lg font-bold">
            {context.current.batch.batch_no}・{context.current.row.sheet_name} {context.current.row.row_number}行目
          </h3>
        </div>
        {context.review ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            判断済み
          </span>
        ) : (
          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
            未判断
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h4 className="font-semibold">今回の提出データ</h4>
          <p className="mt-1 text-xs text-gray-500">
            受付番号：{context.current.batch.batch_no}／提出元：{context.current.batch.partner_name}／対象月：{context.current.batch.target_month}
          </p>
          <div className="mt-4"><RowDetails row={context.current.row} /></div>
        </section>

        <section className="rounded-xl border p-4">
          <h4 className="font-semibold">重複元データ</h4>
          {context.source ? (
            <>
              <p className="mt-1 text-xs text-gray-500">
                受付番号：{context.source.batch.batch_no}／提出元：{context.source.batch.partner_name}／対象月：{context.source.batch.target_month}／受付status：{context.source.batch.status}
              </p>
              <div className="mt-4"><RowDetails row={context.source.row} /></div>
            </>
          ) : (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              重複元行を取得できません。判断操作は実行できません。
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border">
        <div className="bg-gray-50 px-4 py-3 font-semibold">比較結果</div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="border-t bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3">項目</th>
                <th className="px-4 py-3">今回</th>
                <th className="px-4 py-3">重複元</th>
                <th className="px-4 py-3">結果</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {context.comparison.map((item) => (
                <tr key={item.key} className={item.highlight ? "bg-orange-50/60" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{item.label}</td>
                  <td className="max-w-xs break-words px-4 py-3">{formatValue(item.current_value)}</td>
                  <td className="max-w-xs break-words px-4 py-3">{formatValue(item.source_value)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                      item.result === "一致"
                        ? "bg-green-100 text-green-700"
                        : item.result === "比較不能"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {item.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {context.review ? (
        <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          <div className="font-semibold text-green-800">
            {context.review.decision === "separate" ? "別加入として承認" : "重複として除外"}
          </div>
          <div className="mt-2 text-green-900">理由：{context.review.review_note}</div>
          <div className="mt-1 text-xs text-green-700">
            判断者：{context.review.reviewed_by_label}／判断日時：{formatDateTime(context.review.reviewed_at)}
          </div>
        </section>
      ) : canUpdate ? (
        <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              判断
              <select
                value={decision}
                onChange={(event) => {
                  setDecision(event.target.value as DuplicateReviewDecision);
                  setNote("");
                }}
                disabled={busy}
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
              >
                <option value="separate">別加入として承認</option>
                <option value="exclude">重複として除外</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              定型理由
              <select
                value=""
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
              >
                <option value="">選択してください</option>
                {reasonOptions.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            判断理由（必須）
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              rows={3}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
              placeholder="比較結果を確認し、判断理由を入力してください"
            />
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !context.source || !note.trim()}
            className={`rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              decision === "separate" ? "bg-blue-700" : "bg-red-700"
            }`}
          >
            {busy
              ? "保存中..."
              : decision === "separate"
                ? "別加入として承認"
                : "重複として除外"}
          </button>
        </section>
      ) : null}
    </article>
  );
}

export default function DuplicateReviewPanel(props: Props) {
  if (props.contexts.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-orange-300 bg-orange-50 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold">重複確認</h2>
        <p className="mt-1 text-sm text-gray-600">
          保存済みハッシュだけでなく、今回データと重複元データの実値を比較して判断してください。
        </p>
      </div>
      {props.contexts.map((context) => (
        <ReviewCard
          key={context.current.row.id}
          context={context}
          canUpdate={props.canUpdate}
          submittingRowId={props.submittingRowId}
          onReview={props.onReview}
        />
      ))}
    </section>
  );
}
