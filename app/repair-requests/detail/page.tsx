import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import RepairPhotoGallery from "./RepairPhotoGallery";

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
  assigned_to: string | null;
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

type AiSupportFaq = {
  id: string;
  product_category: string | null;
  manufacturer: string | null;
  symptom_category: string | null;
  question: string | null;
  answer: string | null;
  troubleshooting_steps: string | null;
  video_title: string | null;
  video_url: string | null;
  requires_staff: boolean | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type PastRepairRequest = {
  id: string;
  request_no: string;
  product_name: string;
  manufacturer: string | null;
  model_no: string | null;
  symptom_category: string | null;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "received", label: "受付完了" },
  { value: "checking", label: "内容確認中" },
  { value: "manufacturer_checking", label: "メーカー確認中" },
  { value: "repair_arranging", label: "修理手配中" },
  { value: "visit_scheduling", label: "訪問日程調整中" },
  { value: "completed", label: "修理完了" },
  { value: "out_of_warranty", label: "保証対象外" },
  { value: "cancelled", label: "キャンセル" },
] as const;

const STATUS_FLOW = [
  "received",
  "checking",
  "manufacturer_checking",
  "repair_arranging",
  "visit_scheduling",
  "completed",
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

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function statusLabel(status: string | null | undefined) {
  const found = STATUS_OPTIONS.find((option) => option.value === status);
  return found ? found.label : status || "-";
}

function getNextStatus(status: string) {
  const currentIndex = STATUS_FLOW.findIndex((item) => item === status);
  if (currentIndex === -1) return null;
  return STATUS_FLOW[currentIndex + 1] || null;
}

function getIsUsableValue(value: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}


function normalizeForMatch(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function includesEither(left: string, right: string) {
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function findBestFaq(
  request: RepairRequestDetail,
  faqs: AiSupportFaq[]
) {
  const requestProduct = normalizeForMatch(request.product_name);
  const requestManufacturer = normalizeForMatch(request.manufacturer);
  const requestSymptom = normalizeForMatch(
    [
      request.symptom_category,
      request.symptom_detail,
      request.error_code,
    ]
      .filter(Boolean)
      .join(" ")
  );

  let bestFaq: AiSupportFaq | null = null;
  let bestScore = 0;

  for (const faq of faqs) {
    let score = 0;

    const faqProduct = normalizeForMatch(faq.product_category);
    const faqManufacturer = normalizeForMatch(faq.manufacturer);
    const faqSymptom = normalizeForMatch(faq.symptom_category);
    const faqQuestion = normalizeForMatch(faq.question);

    if (includesEither(requestProduct, faqProduct)) {
      score += 5;
    }

    if (
      requestManufacturer &&
      faqManufacturer &&
      includesEither(requestManufacturer, faqManufacturer)
    ) {
      score += 3;
    }

    if (faqSymptom && requestSymptom.includes(faqSymptom)) {
      score += 4;
    }

    if (faqQuestion && requestSymptom.includes(faqQuestion)) {
      score += 2;
    }

    if (faq.requires_staff) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestFaq = faq;
    }
  }

  return bestScore >= 4 ? bestFaq : null;
}

function getSafetyWarnings(request: RepairRequestDetail) {
  const text = normalizeForMatch(
    [
      request.symptom_category,
      request.symptom_detail,
      request.error_code,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const warnings: string[] = [];

  if (
    ["焦げ", "煙", "火花", "発火", "異臭"].some((keyword) =>
      text.includes(keyword)
    )
  ) {
    warnings.push(
      "焦げ臭い・煙・火花・発火の兆候がある場合は、使用を中止し、安全に可能な範囲で電源を切ってください。"
    );
  }

  if (
    ["漏電", "感電", "ブレーカー"].some((keyword) =>
      text.includes(keyword)
    )
  ) {
    warnings.push(
      "漏電・感電・ブレーカー異常が疑われる場合は、無理な再操作を繰り返さずスタッフ判断へ回してください。"
    );
  }

  if (
    ["水漏れ", "漏水", "大量の水"].some((keyword) =>
      text.includes(keyword)
    )
  ) {
    warnings.push(
      "水漏れがある場合は、可能であれば止水し、電気機器へ水がかかっている場合は触れないよう案内してください。"
    );
  }

  if (
    ["ガス臭", "ガスくさい"].some((keyword) =>
      text.includes(keyword)
    )
  ) {
    warnings.push(
      "ガス臭がある場合は火気や電気スイッチの操作を避け、換気とガス事業者への連絡を優先してください。"
    );
  }

  return warnings;
}

function getDefaultChecks(request: RepairRequestDetail) {
  const product = normalizeForMatch(request.product_name);

  const commonChecks = [
    "本体・リモコン・操作パネルに表示されているエラーコードを確認する",
    "電源プラグ、ブレーカー、リモコン電池など基本的な電源状態を確認する",
    "メーカー名・型番・製造番号が読める状態か確認する",
    "症状が発生した時期、頻度、直前に行った操作を確認する",
  ];

  if (
    ["給湯器", "エコキュート", "温水器"].some((keyword) =>
      product.includes(keyword)
    )
  ) {
    return [
      "お湯が出ないのが全箇所か、一部の蛇口だけか確認する",
      "リモコンのエラーコードと時刻表示を確認する",
      "本体・配管まわりの水漏れ、凍結、異音を確認する",
      "給水・給湯・電源の状態を確認する",
      ...commonChecks,
    ];
  }

  if (
    ["エアコン", "空調"].some((keyword) => product.includes(keyword))
  ) {
    return [
      "運転モード、設定温度、風量設定を確認する",
      "室内機フィルターの目詰まりを確認する",
      "室外機の吸込口・吹出口が塞がれていないか確認する",
      "ランプ点滅やリモコンのエラー表示を確認する",
      ...commonChecks,
    ];
  }

  if (
    ["冷蔵庫", "冷凍庫"].some((keyword) => product.includes(keyword))
  ) {
    return [
      "庫内灯と操作パネルが点灯しているか確認する",
      "温度設定とドアの閉まりを確認する",
      "放熱スペースと周囲温度を確認する",
      "異音・霜付き・水漏れの有無を確認する",
      ...commonChecks,
    ];
  }

  if (
    ["洗濯機", "乾燥機"].some((keyword) => product.includes(keyword))
  ) {
    return [
      "給水栓、排水口、ドア・ふたのロック状態を確認する",
      "洗濯物の偏りや入れ過ぎがないか確認する",
      "糸くずフィルターや排水フィルターを確認する",
      "エラーコードと停止した工程を確認する",
      ...commonChecks,
    ];
  }

  if (
    ["太陽光", "パワーコンディショナ", "蓄電池", "hems"].some(
      (keyword) => product.includes(keyword)
    )
  ) {
    return [
      "モニター・パワコン・蓄電池に表示されているエラーコードを確認する",
      "停電・ブレーカー・自立運転設定の状態を確認する",
      "発電量または充放電量がいつから変化したか確認する",
      "異音・焦げ臭い・発熱・水濡れがないか確認する",
      ...commonChecks,
    ];
  }

  return commonChecks;
}

function getRecommendedChecks(
  request: RepairRequestDetail,
  matchedFaq: AiSupportFaq | null
) {
  const faqSteps = String(matchedFaq?.troubleshooting_steps || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-・●■✓]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);

  if (faqSteps.length > 0) {
    return faqSteps.slice(0, 8);
  }

  return getDefaultChecks(request).slice(0, 8);
}

function getRequiredPhotos(request: RepairRequestDetail) {
  const product = normalizeForMatch(request.product_name);

  const photos = [
    "製品全体が分かる写真",
    "メーカー名・型番・製造番号が読める銘板写真",
    "エラーコードやランプ状態が分かる表示部の写真",
    "故障箇所または異常が確認できる写真",
  ];

  if (
    ["水漏れ", "漏水"].some((keyword) =>
      normalizeForMatch(request.symptom_detail).includes(keyword)
    )
  ) {
    photos.push("水漏れ箇所と周辺状況が分かる写真");
  }

  if (
    ["太陽光", "パワーコンディショナ", "蓄電池", "hems"].some(
      (keyword) => product.includes(keyword)
    )
  ) {
    photos.push("モニター画面とブレーカー・配線周辺が分かる写真");
  }

  if (
    ["エアコン"].some((keyword) => product.includes(keyword))
  ) {
    photos.push("室内機と室外機の設置状況が分かる写真");
  }

  return Array.from(new Set(photos)).slice(0, 6);
}

function HiddenRequestFields({
  request,
  status,
}: {
  request: RepairRequestDetail;
  status: string;
}) {
  return (
    <>
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="assigned_to" value={request.assigned_to || ""} />
      <input type="hidden" name="customer_name" value={request.customer_name} />
      <input
        type="hidden"
        name="customer_name_kana"
        value={request.customer_name_kana || ""}
      />
      <input type="hidden" name="phone" value={request.phone} />
      <input type="hidden" name="email" value={request.email || ""} />
      <input type="hidden" name="postal_code" value={request.postal_code || ""} />
      <input type="hidden" name="address" value={request.address || ""} />
      <input type="hidden" name="product_name" value={request.product_name} />
      <input type="hidden" name="manufacturer" value={request.manufacturer || ""} />
      <input type="hidden" name="model_no" value={request.model_no || ""} />
      <input
        type="hidden"
        name="installation_place"
        value={request.installation_place || ""}
      />
      <input
        type="hidden"
        name="failure_date"
        value={toDateInputValue(request.failure_date)}
      />
      <input
        type="hidden"
        name="symptom_category"
        value={request.symptom_category || ""}
      />
      <input type="hidden" name="symptom_detail" value={request.symptom_detail} />
      <input type="hidden" name="error_code" value={request.error_code || ""} />
      <input
        type="hidden"
        name="is_usable"
        value={getIsUsableValue(request.is_usable)}
      />
      <input type="hidden" name="admin_note" value={request.admin_note || ""} />
    </>
  );
}

export default async function RepairRequestDetailPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    request_no?: string;
    updated?: string;
    error?: string;
    photo_added?: string;
  }>;
}) {
  const { id, request_no, updated, error, photo_added } = await searchParams;

  const targetId = (id || "").trim();
  const targetRequestNo = (request_no || "").trim();

  if (!targetId && !targetRequestNo) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          id または request_no が指定されていません
        </div>
      </div>
    );
  }

  const supabase = getAdminClient();

  const selectColumns = `
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
    assigned_to,
    admin_note,
    created_at
  `;

  let data: RepairRequestDetail | null = null;
  let fetchError: unknown = null;

  if (targetId) {
    const result = await supabase
      .from("repair_requests")
      .select(selectColumns)
      .eq("id", targetId)
      .maybeSingle();

    data = result.data as RepairRequestDetail | null;
    fetchError = result.error;
  }

  if (!data && targetRequestNo) {
    const result = await supabase
      .from("repair_requests")
      .select(selectColumns)
      .eq("request_no", targetRequestNo)
      .maybeSingle();

    data = result.data as RepairRequestDetail | null;
    fetchError = result.error;
  }

  if (fetchError || !data) {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <div>修理受付が見つかりませんでした</div>
        <pre className="mt-4 whitespace-pre-wrap text-xs">
          {JSON.stringify(
            {
              targetId,
              targetRequestNo,
              fetchError,
              hasData: !!data,
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
}

  const request = data;

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

  const { data: faqRows } = await supabase
    .from("ai_support_faqs")
    .select(
      "id, product_category, manufacturer, symptom_category, question, answer, troubleshooting_steps, video_title, video_url, requires_staff, is_active, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(200);

  const matchedFaq = findBestFaq(
    request,
    (faqRows || []) as AiSupportFaq[]
  );

  let pastRepairRows: PastRepairRequest[] = [];

  if (request.model_no) {
    const result = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, product_name, manufacturer, model_no, symptom_category, status, created_at"
      )
      .neq("id", request.id)
      .eq("model_no", request.model_no)
      .order("created_at", { ascending: false })
      .limit(5);

    pastRepairRows = (result.data || []) as PastRepairRequest[];
  } else if (request.manufacturer) {
    const result = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, product_name, manufacturer, model_no, symptom_category, status, created_at"
      )
      .neq("id", request.id)
      .eq("manufacturer", request.manufacturer)
      .eq("product_name", request.product_name)
      .order("created_at", { ascending: false })
      .limit(5);

    pastRepairRows = (result.data || []) as PastRepairRequest[];
  } else {
    const result = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, product_name, manufacturer, model_no, symptom_category, status, created_at"
      )
      .neq("id", request.id)
      .eq("product_name", request.product_name)
      .order("created_at", { ascending: false })
      .limit(5);

    pastRepairRows = (result.data || []) as PastRepairRequest[];
  }

  const safetyWarnings = getSafetyWarnings(request);
  const recommendedChecks = getRecommendedChecks(request, matchedFaq);
  const requiredPhotos = getRequiredPhotos(request);

  const nextPath = `/repair-requests/detail?request_no=${encodeURIComponent(
  request.request_no
)}`;
  const remainingPhotoCount = Math.max(0, MAX_FILES - attachments.length);
  const nextStatus = getNextStatus(request.status);
  const currentStatusIndex = STATUS_FLOW.findIndex((item) => item === request.status);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">修理受付詳細・編集</h1>
          <p className="mt-1 text-sm text-gray-500">
            修理受付内容の確認・編集・写真追加・担当者・対応履歴管理を行います
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

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">修理進行状況</h2>
        <p className="mt-1 text-sm text-gray-500">
          現在の対応ステータスを確認できます。
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {STATUS_FLOW.map((statusItem, index) => {
            const isDone = currentStatusIndex >= index;
            const isCurrent = request.status === statusItem;

            return (
              <div key={statusItem} className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                    isDone
                      ? "border-black bg-black text-white"
                      : "border-gray-300 bg-white text-gray-400"
                  }`}
                >
                  {index + 1}
                </div>

                <div className="flex-1">
                  <div
                    className={`text-sm font-semibold ${
                      isCurrent
                        ? "text-black"
                        : isDone
                          ? "text-gray-800"
                          : "text-gray-400"
                    }`}
                  >
                    {statusLabel(statusItem)}
                  </div>

                  {isCurrent ? (
                    <div className="mt-1 text-xs text-blue-600">
                      現在このステータスです
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form method="post" action="/api/repair-request-status" className="space-y-6">
          <input type="hidden" name="request_no" value={request.request_no} />
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
                <label className="text-sm text-gray-500">担当者</label>
                <input
                  name="assigned_to"
                  list="assigned-to-options"
                  defaultValue={request.assigned_to || ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="担当者を選択または入力"
                />
                <datalist id="assigned-to-options">
                  <option value="清水" />
                  <option value="日髙" />
                  <option value="平賀" />
                  <option value="福田" />
                </datalist>
              </div>

              <div>
                <div className="text-sm text-gray-500">保証書番号</div>
                <div className="mt-1 font-medium">{request.certificate_no || "-"}</div>
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
                <label className="text-sm text-gray-500">現在使用できますか</label>
                <select
                  name="is_usable"
                  defaultValue={getIsUsableValue(request.is_usable)}
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
                入力内容・ステータス・担当者・社内対応メモをまとめて更新します。
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
          <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-blue-600">
                  FAQ・受付内容から自動整理
                </p>
                <h2 className="mt-1 text-base font-semibold">
                  AI修理アシスタント
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  電話対応やメーカー確認の前に見るべき項目をまとめています。
                  保証対象・費用・責任区分の最終判断はスタッフが行ってください。
                </p>
              </div>

              <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                対応補助
              </div>
            </div>

            {safetyWarnings.length > 0 ? (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-700">
                  安全確認を優先
                </div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-red-700">
                  {safetyWarnings.map((warning) => (
                    <li key={warning}>・{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5">
              <h3 className="text-sm font-semibold">最初に確認すること</h3>
              <ol className="mt-3 space-y-3">
                {recommendedChecks.map((check, index) => (
                  <li
                    key={`${index}-${check}`}
                    className="flex gap-3 rounded-xl bg-gray-50 p-3 text-sm leading-6 text-gray-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{check}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">準備してもらう写真</h3>
              <div className="mt-3 space-y-2">
                {requiredPhotos.map((photo) => (
                  <div
                    key={photo}
                    className="flex items-start gap-2 rounded-lg border p-3 text-sm text-gray-700"
                  >
                    <span className="mt-0.5 text-green-600">✓</span>
                    <span>{photo}</span>
                  </div>
                ))}
              </div>
            </div>

            {matchedFaq ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-800">
                  関連FAQ候補
                </div>

                <div className="mt-2 text-sm font-medium text-blue-900">
                  {matchedFaq.question || matchedFaq.product_category || "関連FAQ"}
                </div>

                {matchedFaq.answer ? (
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-blue-900">
                    {matchedFaq.answer}
                  </div>
                ) : null}

                {matchedFaq.requires_staff ? (
                  <div className="mt-3 inline-flex rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">
                    スタッフ対応前提FAQ
                  </div>
                ) : null}

                {matchedFaq.video_url ? (
                  <a
                    href={matchedFaq.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 block break-all text-sm font-medium text-blue-700 underline"
                  >
                    {matchedFaq.video_title || "関連動画を開く"}
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                現在、この製品・症状に一致する登録済みFAQはありません。
                現場で繰り返し案内する内容があればFAQ管理へ追加してください。
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold">
                同型番・同製品の過去修理
              </h3>

              {pastRepairRows.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {pastRepairRows.map((pastRepair) => (
                    <Link
                      key={pastRepair.id}
                      href={`/repair-requests/detail?id=${encodeURIComponent(
                        pastRepair.id
                      )}`}
                      className="block rounded-xl border p-3 text-sm hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium">
                          {pastRepair.request_no}
                        </div>
                        <div className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                          {statusLabel(pastRepair.status)}
                        </div>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-gray-500">
                        {pastRepair.product_name}
                        {pastRepair.manufacturer
                          ? ` / ${pastRepair.manufacturer}`
                          : ""}
                        {pastRepair.model_no
                          ? ` / ${pastRepair.model_no}`
                          : ""}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        症状：{pastRepair.symptom_category || "-"} /{" "}
                        {formatDateTime(pastRepair.created_at)}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                  同型番・同製品の過去修理は見つかりませんでした。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">ステータス操作</h2>
            <p className="mt-2 text-sm text-gray-600">
              現在のステータス：{" "}
              <span className="font-semibold">{statusLabel(request.status)}</span>
            </p>

            {nextStatus ? (
              <form
                method="post"
                action="/api/repair-request-status"
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="request_no" value={request.request_no} />
                <input type="hidden" name="next_path" value={nextPath} />
                <input type="hidden" name="action" value="update" />
                <HiddenRequestFields request={request} status={nextStatus} />

                <button
                  type="submit"
                  className="w-full rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  次へ進める：{statusLabel(nextStatus)}
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                このステータスは次の進行ボタン対象外です。必要な場合は左側のステータス選択から変更してください。
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <form method="post" action="/api/repair-request-status">
                <input type="hidden" name="request_no" value={request.request_no} />
                <input type="hidden" name="next_path" value={nextPath} />
                <input type="hidden" name="action" value="update" />
                <HiddenRequestFields request={request} status="out_of_warranty" />

                <button
                  type="submit"
                  className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                >
                  保証対象外
                </button>
              </form>

              <form method="post" action="/api/repair-request-status">
                <input type="hidden" name="request_no" value={request.request_no} />
                <input type="hidden" name="next_path" value={nextPath} />
                <input type="hidden" name="action" value="update" />
                <HiddenRequestFields request={request} status="cancelled" />

                <button
                  type="submit"
                  className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  キャンセル
                </button>
              </form>
            </div>
          </div>

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
                まだ対応履歴はありません。ステータス変更・担当者変更・メモ更新を行うと履歴が追加されます。
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">添付写真</h2>
            <RepairPhotoGallery photos={attachments} />
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

            <form method="post" action="/api/repair-request-status" className="mt-4">
              <input type="hidden" name="request_no" value={request.request_no} />
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