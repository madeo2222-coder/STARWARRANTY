"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  trackingRequiredMailMethods,
  warrantyMailMethodLabels,
  warrantyMailMethods,
  type WarrantyFulfillmentManagement,
  type WarrantyMailMethod,
} from "@/lib/submission-center/warranty-mailing";

type Props = {
  batchId: string;
  batchStatus: string;
  canUpdate: boolean;
  fulfillment: WarrantyFulfillmentManagement;
  onUpdated: () => Promise<void>;
};

type MailInput = {
  mailMethod: WarrantyMailMethod;
  trackingNumber: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

export default function WarrantyFulfillmentPanel({
  batchId,
  batchStatus,
  canUpdate,
  fulfillment,
  onUpdated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [printCount, setPrintCount] = useState(1);
  const [printNote, setPrintNote] = useState("");
  const [mailInputs, setMailInputs] = useState<Record<string, MailInput>>(() =>
    Object.fromEntries(
      fulfillment.certificates.map((certificate) => [
        certificate.id,
        { mailMethod: "regular_mail", trackingNumber: "" },
      ])
    )
  );
  const [mailNote, setMailNote] = useState("");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const certificateIds = fulfillment.certificates.map(
    (certificate) => certificate.id
  );
  const certificateNumbers = fulfillment.certificates.map(
    (certificate) => certificate.certificate_number
  );
  const allConfirmed =
    certificateIds.length > 0 && confirmedIds.length === certificateIds.length;
  const recordsByCertificateId = new Map(
    fulfillment.records.map((record) => [record.certificate_id, record])
  );
  const allPrinted =
    certificateIds.length > 0 &&
    certificateIds.every(
      (certificateId) =>
        recordsByCertificateId.get(certificateId)?.print_status === "printed"
    );
  const mailItemsReady = certificateIds.every((certificateId) => {
    const input = mailInputs[certificateId];
    return (
      input !== undefined &&
      (!trackingRequiredMailMethods.has(input.mailMethod) ||
        input.trackingNumber.trim().length > 0)
    );
  });

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session?.access_token) {
      throw new Error("ログイン情報を確認できませんでした。");
    }
    return session.access_token;
  }

  async function callFulfillmentAction(body: Record<string, unknown>) {
    const accessToken = await getAccessToken();
    const response = await fetch(`/api/submission-batches/${batchId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as {
      success?: boolean;
      code?: string;
      error?: string;
    };
    if (!response.ok || !json.success) {
      throw new Error(
        `${json.code ? `[${json.code}] ` : ""}${json.error || "保証書の発送処理に失敗しました。"}`
      );
    }
  }

  function toggleConfirmation(certificateId: string) {
    setConfirmedIds((current) =>
      current.includes(certificateId)
        ? current.filter((value) => value !== certificateId)
        : [...current, certificateId]
    );
  }

  function updateMailInput(
    certificateId: string,
    update: Partial<MailInput>
  ) {
    setMailInputs((current) => ({
      ...current,
      [certificateId]: {
        mailMethod: current[certificateId]?.mailMethod || "regular_mail",
        trackingNumber: current[certificateId]?.trackingNumber || "",
        ...update,
      },
    }));
  }

  async function openPdf(certificateId: string) {
    if (pdfLoadingId) return;
    setPdfLoadingId(certificateId);
    setErrorMessage("");
    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/generate-warranty-pdf?id=${encodeURIComponent(certificateId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(json?.error || "保証書PDFを取得できませんでした。");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保証書PDFを取得できませんでした。"
      );
    } finally {
      setPdfLoadingId(null);
    }
  }

  async function confirmPrinted() {
    if (!allConfirmed || submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await callFulfillmentAction({
        action: "confirm_warranty_printed",
        certificate_ids: confirmedIds,
        certificate_numbers: certificateNumbers,
        print_count: printCount,
        note: printNote.trim(),
      });
      setSuccessMessage("全保証書の印刷確認を記録しました。");
      setConfirmedIds([]);
      await onUpdated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "印刷確認に失敗しました。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmMailed() {
    if (!allPrinted || !mailItemsReady || submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await callFulfillmentAction({
        action: "confirm_warranty_mailed",
        mail_items: certificateIds.map((certificateId) => ({
          certificate_id: certificateId,
          certificate_number: fulfillment.certificates.find(
            (certificate) => certificate.id === certificateId
          )?.certificate_number,
          mail_method: mailInputs[certificateId].mailMethod,
          tracking_number: mailInputs[certificateId].trackingNumber.trim(),
        })),
        note: mailNote.trim(),
      });
      setSuccessMessage("全保証書の郵送確認を記録しました。");
      await onUpdated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "郵送確認に失敗しました。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!canUpdate) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold">保証書 印刷・郵送管理</h2>
        <p className="mt-1 text-sm text-gray-600">
          本部でPDFを確認・印刷し、顧客住所への郵送結果を記録します。
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}
      {fulfillment.errors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold">保証書整合性エラー</div>
          <ul className="mt-2 list-disc pl-5">
            {fulfillment.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3 text-sm">
          印刷対象 <strong>{fulfillment.expected_count}件</strong>
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          整合性確認済み <strong>{fulfillment.matched_count}件</strong>
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          現在状態 <strong>{batchStatus}</strong>
        </div>
      </div>

      <div className="space-y-3">
        {fulfillment.certificates.map((certificate) => {
          const record = recordsByCertificateId.get(certificate.id);
          const checked = confirmedIds.includes(certificate.id);
          const mailInput = mailInputs[certificate.id] || {
            mailMethod: "regular_mail" as const,
            trackingNumber: "",
          };
          const trackingRequired = trackingRequiredMailMethods.has(
            mailInput.mailMethod
          );
          return (
            <div key={certificate.id} className="rounded-xl border bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-gray-500">保証書番号：</span>{certificate.certificate_number}</div>
                  <div><span className="text-gray-500">顧客名：</span>{certificate.customer_name}</div>
                  <div><span className="text-gray-500">郵便番号：</span>{certificate.postal_code || "-"}</div>
                  <div className="sm:col-span-2"><span className="text-gray-500">住所：</span>{certificate.address || "-"}</div>
                  <div className="sm:col-span-2"><span className="text-gray-500">商品：</span>{certificate.product_names.join("、") || "-"}</div>
                  {record?.print_status === "printed" ? (
                    <div className="sm:col-span-2 rounded-lg bg-orange-50 p-3">
                      印刷済み：{formatDateTime(record.printed_at)} / {record.printed_by_label || "-"} / {record.print_count}枚
                      {record.print_note ? <div className="mt-1">メモ：{record.print_note}</div> : null}
                    </div>
                  ) : null}
                  {record?.mail_status === "mailed" ? (
                    <div className="sm:col-span-2 rounded-lg bg-cyan-50 p-3">
                      郵送済み：{formatDateTime(record.mailed_at)} / {record.mailed_by_label || "-"} / {record.mail_method ? warrantyMailMethodLabels[record.mail_method] : "-"}
                      <div>追跡番号：{record.tracking_number || "なし"}</div>
                      <div>郵送先：〒{record.postal_code_snapshot || "-"} {record.address_snapshot || "-"} {record.recipient_name_snapshot || "-"}</div>
                      {record.mail_note ? <div>メモ：{record.mail_note}</div> : null}
                    </div>
                  ) : null}
                  {batchStatus === "printed" ? (
                    <div className="sm:col-span-2 grid gap-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 sm:grid-cols-2">
                      <label>
                        郵送方法
                        <select
                          value={mailInput.mailMethod}
                          onChange={(event) =>
                            updateMailInput(certificate.id, {
                              mailMethod: event.target.value as WarrantyMailMethod,
                            })
                          }
                          className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                        >
                          {warrantyMailMethods.map((method) => (
                            <option key={method} value={method}>
                              {warrantyMailMethodLabels[method]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        追跡番号{trackingRequired ? "（必須）" : "（任意）"}
                        <input
                          type="text"
                          value={mailInput.trackingNumber}
                          onChange={(event) =>
                            updateMailInput(certificate.id, {
                              trackingNumber: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="flex min-w-48 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void openPdf(certificate.id)}
                    disabled={pdfLoadingId !== null}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pdfLoadingId === certificate.id ? "PDF取得中..." : "PDFを開く"}
                  </button>
                  {batchStatus === "warranty_created" ? (
                    <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleConfirmation(certificate.id)}
                        disabled={!fulfillment.ready}
                      />
                      この保証書の印刷を確認
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {batchStatus === "warranty_created" ? (
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="font-semibold">印刷確認</h3>
          <label className="block text-sm">
            印刷枚数（各保証書）
            <input
              type="number"
              min={1}
              step={1}
              value={printCount}
              onChange={(event) => setPrintCount(Number(event.target.value))}
              className="mt-1 w-32 rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            印刷メモ
            <textarea
              value={printNote}
              onChange={(event) => setPrintNote(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void confirmPrinted()}
            disabled={submitting || !fulfillment.ready || !allConfirmed || !Number.isInteger(printCount) || printCount < 1}
            className="rounded-lg bg-indigo-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "更新中..." : "全件印刷済みにする"}
          </button>
        </div>
      ) : null}

      {batchStatus === "printed" ? (
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="font-semibold">郵送確認</h3>
          <p className="text-sm text-gray-600">
            全保証書の宛名・郵便番号・住所を確認してから郵送結果を登録してください。
          </p>
          <label className="block text-sm">
            郵送メモ
            <textarea
              value={mailNote}
              onChange={(event) => setMailNote(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void confirmMailed()}
            disabled={submitting || !allPrinted || !mailItemsReady}
            className="rounded-lg bg-cyan-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "更新中..." : "全件郵送済みにする"}
          </button>
        </div>
      ) : null}

      {fulfillment.events.length > 0 ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">印刷・郵送履歴</h3>
          <div className="mt-3 space-y-2 text-sm">
            {fulfillment.events.map((event) => (
              <div key={event.id} className="rounded-lg bg-gray-50 p-3">
                {event.event_type} / {formatDateTime(event.created_at)} / {event.actor_label}
                {event.note ? <div className="mt-1">{event.note}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
