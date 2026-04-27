import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "repair_request_attachments";
const MAX_FILES = 5;

type RepairRequestDetail = {
  id: string;
  request_no: string;
  certificate_id: string | null;
  certificate_no: string | null;
  customer_name: string;
  customer_name_kana: string | null;
  phone: string;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  product_name: string;
  manufacturer: string | null;
  model_no: string | null;
  installation_place: string | null;
  failure_date: string | null;
  symptom_category: string | null;
  symptom_detail: string;
  error_code: string | null;
  is_usable: boolean | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

type RepairRequestAttachment = {
  id: string;
  repair_request_id: string;
  file_path: string;
  signed_url?: string | null;
};

type RepairRequestHistory = {
  id: string;
  repair_request_id: string;
  action_type: string;
  title: string;
  detail: string | null;
  created_by: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "received", label: "受付" },
  { value: "checking", label: "内容確認中" },
  { value: "manufacturer_checking", label: "メーカー確認中" },
  { value: "repair_arranging", label: "修理手配中" },
  { value: "visit_scheduling", label: "訪問日調整中" },
  { value: "completed", label: "修理完了" },
  { value: "out_of_warranty", label: "保証対象外" },
  { value: "cancelled", label: "キャンセル" },
] as const;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function getFileNameFromPath(filePath: string) {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export default async function RepairRequestDetailPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    updated?: string;
    error?: string;
    photo_added?: string;
  }>;
}) {
  const { id, updated, error, photo_added } = await searchParams;

  if (!id) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          id が指定されていません
        </div>
      </div>
    );
  }

  const supabase = getAdminClient();

  const { data, error: fetchError } = await supabase
    .from("repair_requests")
    .select(
      `
      id,
      request_no,
      certificate_id,
      certificate_no,
      customer_name,
      customer_name_kana,
      phone,
      email,
      postal_code,
      address,
      product_name,
      manufacturer,
      model_no,
      installation_place,
      failure_date,
      symptom_category,
      symptom_detail,
      error_code,
      is_usable,
      status,
      admin_note,
      created_at
    `
    )
    .eq("id", id)
    .single();

  if (fetchError || !data) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          修理受付が見つかりませんでした
        </div>
      </div>
    );
  }

  const request = data as RepairRequestDetail;

  const { data: attachmentRows } = await supabase
    .from("repair_request_attachments")
    .select("id, repair_request_id, file_path")
    .eq("repair_request_id", request.id);

  const attachments: RepairRequestAttachment[] = [];

  for (const attachment of (attachmentRows || []) as RepairRequestAttachment[]) {
    const { data: signedData } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(attachment.file_path, 60 * 60);

    attachments.push({
      ...attachment,
      signed_url: signedData?.signedUrl || null,
    });
  }

  const { data: historyRows } = await supabase
    .from("repair_request_histories")
    .select("id, repair_request_id, action_type, title, detail, created_by, created_at")
    .eq("repair_request_id", request.id)
    .order("created_at", { ascending: false });

  const histories = (historyRows || []) as RepairRequestHistory[];

  const nextPath = `/repair-requests/detail?id=${request.id}`;
  const remainingPhotoCount = Math.max(0, MAX_FILES - attachments.length);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">修理受付詳細・編集</h1>
          <p className="mt-1 text-sm text-gray-500">
            修理受付内容の確認・編集・写真追加・対応履歴管理を行います
          </p>
        </div>

        <Link
          href="/repair-requests"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          一覧へ戻る
        </Link>
      </div>

      {updated === "1" ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          修理受付を更新しました。
        </div>
      ) : null}

      {photo_added === "1" ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          写真を追加しました。
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          処理に失敗しました: {decodeURIComponent(error)}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form
          method="post"
          action="/api/repair-request-status"
          className="space-y-6"
        >
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="next_path" value={nextPath} />
          <input type="hidden" name="action" value="update" />

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">受付情報</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm text-gray-500">受付番号</div>
                <div className="mt-1 font-medium">{request.request_no}</div>
              </div>

              <div>
                <label className="text-sm text-gray-500">ステータス</label>
                <select
                  name="status"
                  defaultValue={request.status}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm text-gray-500">保証書番号</div>
                <div className="mt-1 font-medium">
                  {request.certificate_no || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">受付日時</div>
                <div className="mt-1 font-medium">
                  {formatDateTime(request.created_at)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">お客様情報</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm text-gray-500">お名前</label>
                <input
                  name="customer_name"
                  defaultValue={request.customer_name}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">お名前カナ</label>
                <input
                  name="customer_name_kana"
                  defaultValue={request.customer_name_kana || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">電話番号</label>
                <input
                  name="phone"
                  defaultValue={request.phone}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">メールアドレス</label>
                <input
                  name="email"
                  defaultValue={request.email || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">郵便番号</label>
                <input
                  name="postal_code"
                  defaultValue={request.postal_code || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-gray-500">住所</label>
                <input
                  name="address"
                  defaultValue={request.address || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">故障内容</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm text-gray-500">対象機器</label>
                <input
                  name="product_name"
                  defaultValue={request.product_name}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">メーカー名</label>
                <input
                  name="manufacturer"
                  defaultValue={request.manufacturer || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">型番</label>
                <input
                  name="model_no"
                  defaultValue={request.model_no || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">設置場所</label>
                <input
                  name="installation_place"
                  defaultValue={request.installation_place || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">故障発生日</label>
                <input
                  type="date"
                  name="failure_date"
                  defaultValue={toDateInputValue(request.failure_date)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">症状区分</label>
                <input
                  name="symptom_category"
                  defaultValue={request.symptom_category || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">エラーコード</label>
                <input
                  name="error_code"
                  defaultValue={request.error_code || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">
                  現在使用できますか
                </label>
                <select
                  name="is_usable"
                  defaultValue={
                    request.is_usable === true
                      ? "yes"
                      : request.is_usable === false
                        ? "no"
                        : ""
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">未選択</option>
                  <option value="yes">使える</option>
                  <option value="no">使えない</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-gray-500">故障内容詳細</label>
                <textarea
                  name="symptom_detail"
                  defaultValue={request.symptom_detail}
                  className="mt-1 min-h-[140px] w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">社内対応メモ</h2>
            <p className="mt-1 text-sm text-gray-500">
              お客様には表示されない、社内用の対応メモです。
            </p>

            <textarea
              name="admin_note"
              defaultValue={request.admin_note || ""}
              className="mt-4 min-h-[180px] w-full rounded-lg border px-3 py-2"
              placeholder="例：メーカーへ確認中、訪問日調整済み、部品手配中、お客様へ連絡済み など"
            />
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">編集内容を保存</h2>
              <p className="mt-1 text-sm text-gray-500">
                入力内容・ステータス・社内対応メモをまとめて更新します。
              </p>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-black px-5 py-2 text-sm text-white hover:opacity-90"
            >
              編集内容を保存する
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">対応履歴タイムライン</h2>

            {histories.length > 0 ? (
              <div className="mt-4 space-y-4">
                {histories.map((history) => (
                  <div key={history.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{history.title}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {history.created_by || "-"} /{" "}
                          {formatDateTime(history.created_at)}
                        </div>
                      </div>
                      <div className="rounded-full border bg-gray-50 px-2 py-1 text-xs text-gray-500">
                        {history.action_type}
                      </div>
                    </div>

                    {history.detail ? (
                      <div className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                        {history.detail}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                まだ対応履歴はありません。ステータス変更やメモ更新を行うと履歴が追加されます。
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">添付写真</h2>

            {attachments.length > 0 ? (
              <div className="mt-4 grid gap-4">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-xl border p-3">
                    {attachment.signed_url ? (
                      <a
                        href={attachment.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attachment.signed_url}
                          alt="添付写真"
                          className="h-56 w-full rounded-lg object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex h-56 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
                        写真を表示できません
                      </div>
                    )}

                    <div className="mt-3 break-all text-xs text-gray-500">
                      {getFileNameFromPath(attachment.file_path)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                添付写真はありません。
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">写真を追加</h2>
            <p className="mt-2 text-sm text-gray-600">
              現在 {attachments.length} 枚登録済みです。追加できる写真は残り{" "}
              {remainingPhotoCount} 枚です。
            </p>

            {remainingPhotoCount > 0 ? (
              <form
                method="post"
                action="/api/repair-request-attachments"
                encType="multipart/form-data"
                className="mt-4 space-y-4"
              >
                <input type="hidden" name="repair_request_id" value={request.id} />
                <input type="hidden" name="next_path" value={nextPath} />

                <input
                  type="file"
                  name="files"
                  accept="image/*"
                  multiple
                  className="w-full rounded-lg border px-3 py-2"
                />

                <p className="text-xs text-gray-500">
                  合計最大5枚まで。複数選択できます。
                </p>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  写真を追加する
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                写真は最大5枚まで登録済みです。
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-700">
              修理受付を削除
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              この修理受付と添付写真を削除します。削除後は一覧へ戻ります。
            </p>

            <form
              method="post"
              action="/api/repair-request-status"
              className="mt-4"
            >
              <input type="hidden" name="request_id" value={request.id} />
              <input type="hidden" name="next_path" value={nextPath} />
              <input type="hidden" name="action" value="delete" />

              <button
                type="submit"
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:opacity-90"
              >
                この修理受付を削除する
              </button>
            </form>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">操作</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/repair-requests"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                修理受付一覧へ戻る
              </Link>
              <Link
                href="/warranty-certificates"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                保証書一覧へ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}