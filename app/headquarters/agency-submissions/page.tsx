import Link from "next/link";

export const dynamic = "force-dynamic";

type SubmissionStatus =
  | "submitted"
  | "reviewing"
  | "returned"
  | "approved"
  | "processing"
  | "completed";

type SubmissionPreview = {
  id: string;
  submissionNo: string;
  agencyName: string;
  targetMonth: string;
  originalFilename: string;
  submittedAt: string;
  status: SubmissionStatus;
};

const previewSubmissions: SubmissionPreview[] = [];

const statusLabels: Record<SubmissionStatus, string> = {
  submitted: "受付済",
  reviewing: "確認中",
  returned: "差戻し",
  approved: "受付完了",
  processing: "処理中",
  completed: "処理完了",
};

const statusClasses: Record<SubmissionStatus, string> = {
  submitted: "bg-blue-100 text-blue-700",
  reviewing: "bg-yellow-100 text-yellow-700",
  returned: "bg-red-100 text-red-700",
  approved: "bg-green-100 text-green-700",
  processing: "bg-purple-100 text-purple-700",
  completed: "bg-gray-100 text-gray-700",
};

function countByStatus(
  submissions: SubmissionPreview[],
  statuses: SubmissionStatus[]
) {
  return submissions.filter((submission) =>
    statuses.includes(submission.status)
  ).length;
}

export default function HeadquartersAgencySubmissionsPage() {
  const submittedCount = countByStatus(previewSubmissions, ["submitted"]);
  const reviewingCount = countByStatus(previewSubmissions, ["reviewing"]);
  const processingCount = countByStatus(previewSubmissions, [
    "approved",
    "processing",
  ]);
  const completedCount = countByStatus(previewSubmissions, ["completed"]);
  const returnedCount = countByStatus(previewSubmissions, ["returned"]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">
            STAR WARRANTY Headquarters
          </p>

          <h1 className="text-2xl font-bold">代理店提出センター</h1>

          <p className="mt-1 text-sm text-gray-500">
            代理店・施工店から提出された加入データを確認し、
            受付・差戻し・処理状況を管理します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/headquarters"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            本部管理へ戻る
          </Link>

          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            ホームへ
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        現在は提出センターの画面土台です。次の工程で、
        代理店から提出されたExcelファイルとSupabaseを接続します。
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">受付済</div>
          <div className="mt-2 text-3xl font-bold text-blue-700">
            {submittedCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">確認中</div>
          <div className="mt-2 text-3xl font-bold text-yellow-700">
            {reviewingCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">差戻し</div>
          <div className="mt-2 text-3xl font-bold text-red-700">
            {returnedCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">処理中</div>
          <div className="mt-2 text-3xl font-bold text-purple-700">
            {processingCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">処理完了</div>
          <div className="mt-2 text-3xl font-bold text-green-700">
            {completedCount}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">提出一覧</h2>
              <p className="mt-1 text-sm text-gray-500">
                代理店名・対象月・ファイル名・受付状態を表示します。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                defaultValue="all"
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                disabled
              >
                <option value="all">全ステータス</option>
              </select>

              <input
                type="month"
                className="rounded-lg border px-3 py-2 text-sm"
                disabled
              />
            </div>
          </div>
        </div>

        {previewSubmissions.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-lg font-bold text-gray-700">
              まだ提出データはありません
            </div>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              代理店向けExcel提出画面とデータベースを接続すると、
              ここに提出内容が自動表示されます。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">受付番号</th>
                  <th className="whitespace-nowrap px-4 py-3">代理店</th>
                  <th className="whitespace-nowrap px-4 py-3">対象月</th>
                  <th className="whitespace-nowrap px-4 py-3">ファイル</th>
                  <th className="whitespace-nowrap px-4 py-3">提出日時</th>
                  <th className="whitespace-nowrap px-4 py-3">状態</th>
                  <th className="whitespace-nowrap px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {previewSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {submission.submissionNo}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {submission.agencyName}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {submission.targetMonth}
                    </td>

                    <td className="max-w-[260px] truncate px-4 py-3">
                      {submission.originalFilename}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {submission.submittedAt}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          statusClasses[submission.status]
                        }`}
                      >
                        {statusLabels[submission.status]}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        disabled
                        className="rounded-lg border px-3 py-2 text-xs text-gray-400"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold">次の実装</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            代理店向けExcelアップロード画面を作成します。
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold">その次</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            本部でExcelを確認し、受付・差戻し・承認できるようにします。
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold">将来連携</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            承認された加入データから保証書・請求書を自動生成します。
          </p>
        </div>
      </div>
    </div>
  );
}