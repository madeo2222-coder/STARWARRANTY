import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "repair_request_attachments";

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

function getSupabaseAdmin() {
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

function normalizePhone(value: string | null | undefined) {
  return (value || "")
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^0-9]/g, "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function getStep(status: string | null | undefined) {
  switch (status) {
    case "received":
      return 1;
    case "checking":
      return 2;
    case "manufacturer_checking":
      return 3;
    case "repair_arranging":
      return 4;
    case "visit_scheduling":
      return 5;
    case "completed":
      return 6;
    case "out_of_warranty":
    case "cancelled":
      return 0;
    default:
      return 1;
  }
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "received":
      return "受付完了";
    case "checking":
      return "内容確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日程調整中";
    case "completed":
      return "修理完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return "確認中";
  }
}

function getStatusMessage(status: string | null | undefined) {
  switch (status) {
    case "received":
      return "修理受付を受け付けました。内容確認を進めています。";
    case "checking":
      return "受付内容を確認しています。確認完了までしばらくお待ちください。";
    case "manufacturer_checking":
      return "メーカーへ確認中です。回答があり次第、次の対応へ進みます。";
    case "repair_arranging":
      return "修理手配を進めています。";
    case "visit_scheduling":
      return "訪問日程の調整段階です。担当者からの案内をお待ちください。";
    case "completed":
      return "修理対応が完了しました。";
    case "out_of_warranty":
      return "確認の結果、保証対象外となっています。";
    case "cancelled":
      return "この修理受付はキャンセルされています。";
    default:
      return "現在の受付状況を確認しています。";
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    request_no?: string;
    phone?: string;
  }>;
}) {
  const params = await searchParams;

  const requestNo = (params.request_no || "").trim();
  const phone = (params.phone || "").trim();
  const normalizedInputPhone = normalizePhone(phone);

  if (!requestNo) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold tracking-widest text-gray-400">
              STAR WARRANTY
            </p>
            <h1 className="mt-2 text-xl font-bold text-gray-900">
              修理受付状況の確認
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              メールに記載された受付番号を入力して、現在の修理状況をご確認ください。
            </p>
          </div>

          <form method="GET" className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                受付番号
              </label>
              <input
                name="request_no"
                required
                placeholder="例：RR-20260506-204901"
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                電話番号
              </label>
              <input
                name="phone"
                inputMode="tel"
                placeholder="例：09012345678"
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-gray-400">
                ハイフンあり・なし、どちらでも確認できます。
              </p>
            </div>

            <button className="w-full rounded-xl bg-black py-3 font-bold text-white">
              状況を確認する
            </button>
          </form>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("repair_requests")
    .select("*")
    .eq("request_no", requestNo)
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold tracking-widest text-gray-400">
            STAR WARRANTY
          </p>
          <h1 className="mt-3 text-lg font-bold text-red-600">
            修理受付が見つかりません
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            受付番号をご確認のうえ、もう一度お試しください。
          </p>
          <a
            href="/repair-status"
            className="mt-6 inline-block rounded-xl bg-black px-5 py-3 text-sm font-bold text-white"
          >
            再入力する
          </a>
        </div>
      </main>
    );
  }

  const normalizedDataPhone = normalizePhone(data.phone);

  if (
    normalizedInputPhone &&
    normalizedDataPhone &&
    normalizedInputPhone !== normalizedDataPhone
  ) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold tracking-widest text-gray-400">
            STAR WARRANTY
          </p>
          <h1 className="mt-3 text-lg font-bold text-red-600">
            電話番号が一致しません
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            受付番号または電話番号をご確認ください。
          </p>
          <a
            href="/repair-status"
            className="mt-6 inline-block rounded-xl bg-black px-5 py-3 text-sm font-bold text-white"
          >
            再入力する
          </a>
        </div>
      </main>
    );
  }

  const { data: attachmentRows } = await supabase
    .from("repair_request_attachments")
    .select("id, repair_request_id, file_path")
    .eq("repair_request_id", data.id);

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
    .eq("repair_request_id", data.id)
    .order("created_at", { ascending: false });

  const histories = (historyRows || []) as RepairRequestHistory[];

  const step = getStep(data.status);
  const isStopped =
    data.status === "out_of_warranty" || data.status === "cancelled";

  const steps = [
    "受付",
    "内容確認",
    "メーカー確認",
    "修理手配",
    "日程調整",
    "完了",
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-widest text-gray-400">
            STAR WARRANTY
          </p>
          <h1 className="mt-2 text-xl font-bold text-gray-900">
            修理状況のご案内
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            受付番号：{data.request_no}
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">現在の状況</p>
          <div
            className={`mt-3 rounded-2xl p-4 ${
              isStopped ? "bg-red-50" : "bg-gray-900"
            }`}
          >
            <p
              className={`text-xl font-bold ${
                isStopped ? "text-red-600" : "text-white"
              }`}
            >
              {getStatusLabel(data.status)}
            </p>
            <p
              className={`mt-2 text-sm leading-6 ${
                isStopped ? "text-red-500" : "text-gray-200"
              }`}
            >
              {getStatusMessage(data.status)}
            </p>
          </div>
        </section>

        {!isStopped && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">進行状況</h2>

            <div className="mt-5 space-y-4">
              {steps.map((label, index) => {
                const current = index + 1 <= step;
                const active = index + 1 === step;

                return (
                  <div key={label} className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        current
                          ? "bg-black text-white"
                          : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      {index + 1}
                    </div>

                    <div className="flex-1">
                      <p
                        className={`text-sm ${
                          current ? "font-bold text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {label}
                      </p>
                      {active ? (
                        <p className="mt-1 text-xs text-gray-500">
                          現在この段階です
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {histories.length > 0 ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">対応履歴</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              修理受付後の対応状況を時系列で確認できます。
            </p>

            <div className="mt-5 space-y-4">
              {histories.map((history) => (
                <div key={history.id} className="flex gap-3">
                  <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs text-white">
                    ✓
                  </div>

                  <div className="flex-1 rounded-xl border bg-gray-50 p-3">
                    <p className="text-sm font-bold text-gray-900">
                      {history.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDateTime(history.created_at)}
                    </p>
                    {history.detail ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">
                        {history.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {attachments.length > 0 ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">添付写真</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              受付時または対応中に登録された写真です。
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {attachments.map((photo, index) => (
                <a
                  key={photo.id}
                  href={photo.signed_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border bg-gray-100"
                >
                  {photo.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.signed_url}
                      alt={`修理受付写真 ${index + 1}`}
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-xs text-gray-400">
                      写真を表示できません
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}