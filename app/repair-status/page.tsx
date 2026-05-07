import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

function normalizePhone(value: string | null | undefined) {
  return (value || "")
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^0-9]/g, "");
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
  searchParams: { request_no?: string; phone?: string };
}) {
  const requestNo = (searchParams.request_no || "").trim();
  const phone = (searchParams.phone || "").trim();
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
                placeholder="例：REQ-000001"
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

  const step = getStep(data.status);

  const steps = [
    "受付",
    "内容確認",
    "メーカー確認",
    "修理手配",
    "日程調整",
    "完了",
  ];

  const isStopped =
    data.status === "out_of_warranty" || data.status === "cancelled";

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
                      {active && (
                        <p className="mt-1 text-xs text-gray-500">
                          現在この段階です
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs leading-6 text-gray-500">
            状況に変更があった場合は、担当者よりメール等でご案内いたします。
            ご不明点がある場合は、受付番号をお控えのうえお問い合わせください。
          </p>
        </section>
      </div>
    </main>
  );
}