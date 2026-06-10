import AiSupportFaqsClient from "../_components/AiSupportFaqsClient";

const applianceProductCategories = [
  "冷蔵庫",
  "冷凍庫",
  "洗濯機",
  "ドラム式洗濯機",
  "衣類乾燥機",
  "テレビ",
  "電子レンジ",
  "オーブンレンジ",
  "炊飯器",
  "掃除機",
  "空気清浄機",
  "加湿器",
  "除湿機",
  "扇風機",
  "ヒーター",
  "ドライヤー",
  "プリンター",
  "パソコン",
  "タブレット",
  "カメラ",
  "その他",
];

export default function AiSupportFaqsAppliancePage() {
  return (
    <AiSupportFaqsClient
      faqGroup="appliance"
      pageTitle="AI一次受付 FAQ管理（家電用）"
      pageDescription="家電向けのよくある質問・復旧手順・動画URLを登録します。"
      productCategories={applianceProductCategories}
      defaultProductCategory="冷蔵庫"
    />
  );
}