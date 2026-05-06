import { createClient } from "@/lib/supabase";

export default async function Page({
  searchParams,
}: {
  searchParams: { request_no?: string; phone?: string };
}) {
  const supabase = createClient();

  const requestNo = searchParams.request_no || "";
  const phone = searchParams.phone || "";

  if (!requestNo || !phone) {
    return (
      <div style={{ padding: 20 }}>
        <h2>修理受付状況の確認</h2>

        <form method="GET">
          <div>
            <label>受付番号</label>
            <input
              name="request_no"
              defaultValue={requestNo}
              required
              style={{ display: "block", marginBottom: 10 }}
            />
          </div>

          <div>
            <label>電話番号</label>
            <input
              name="phone"
              defaultValue={phone}
              required
              // ❌ pattern削除
              style={{ display: "block", marginBottom: 10 }}
            />
          </div>

          <button type="submit">受付状況を確認する</button>
        </form>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("repair_requests")
    .select("*")
    .eq("request_no", requestNo)
    .eq("phone", phone)
    .single();

  if (error || !data) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        修理受付が見つかりませんでした
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>修理受付状況</h2>

      <p>受付番号：{data.request_no}</p>
      <p>ステータス：{data.status}</p>
      <p>お名前：{data.customer_name}</p>
    </div>
  );
}