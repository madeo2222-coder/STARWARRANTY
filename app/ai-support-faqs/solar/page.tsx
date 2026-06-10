import AiSupportFaqsClient from "../_components/AiSupportFaqsClient";
const solarProductCategories = [
  "太陽光パネル",
  "パワーコンディショナ",
  "蓄電池",
  "HEMS",
  "接続箱",
  "分電盤",
  "モニター",
  "売電メーター",
  "ケーブル",
  "架台",
  "その他",
];

export default function AiSupportFaqsSolarPage() {
  return (
    <AiSupportFaqsClient
      faqGroup="solar"
      pageTitle="AI一次受付 FAQ管理（太陽光用）"
      pageDescription="太陽光・蓄電池向けのよくある質問・復旧手順・動画URLを登録します。"
      productCategories={solarProductCategories}
      defaultProductCategory="太陽光パネル"
    />
  );
}