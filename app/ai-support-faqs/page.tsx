import AiSupportFaqsClient from "./_components/AiSupportFaqsClient";

const housingProductCategories = [
  "給湯器",
  "エコキュート",
  "エアコン",
  "コンロ",
  "換気扇",
  "インターホン",
  "温水洗浄便座",
  "システムバス",
  "システムキッチン",
  "食器洗い乾燥機",
  "浴室換気乾燥機",
  "床暖房",
  "電子錠",
  "照明",
  "その他",
];

export default function AiSupportFaqsPage() {
  return (
    <AiSupportFaqsClient
      faqGroup="housing"
      pageTitle="AI一次受付 FAQ管理（住宅設備用）"
      pageDescription="住宅設備向けのよくある質問・復旧手順・動画URLを登録します。"
      productCategories={housingProductCategories}
      defaultProductCategory="エコキュート"
    />
  );
}