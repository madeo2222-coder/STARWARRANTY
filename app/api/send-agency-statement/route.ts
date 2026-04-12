import { NextResponse } from "next/server";
import { Resend } from "resend";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

type RequestBody = {
  agency_id?: string;
  agency_name?: string;
  to_email?: string;
  target_month?: string;
  issued_date?: string;
  previous_month_paid_amount?: number;
  monthly_system_fee?: number;
  settlement_fee?: number;
  provisional_payout?: number;
  payout_status?: string;
  paid_at?: string | null;
  previous_month_count?: number;
};

const resend = new Resend(process.env.RESEND_API_KEY);

const FONT_URL =
  "https://fonts.gstatic.com/ea/notosansjp/v6/NotoSansJP-Regular.otf";

Font.register({
  family: "NotoSansJP",
  src: FONT_URL,
});

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "NotoSansJP",
    fontSize: 10,
    color: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
  },
  company: {
    fontSize: 10,
    marginBottom: 4,
  },
  agencyName: {
    fontSize: 16,
    marginTop: 8,
  },
  cardRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  card: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
  },
  cardLabel: {
    fontSize: 9,
    color: "#6B7280",
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 14,
  },
  section: {
    marginTop: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  th: {
    width: "40%",
    padding: 8,
    backgroundColor: "#F9FAFB",
  },
  td: {
    width: "60%",
    padding: 8,
  },
  note: {
    marginTop: 16,
    fontSize: 9,
    color: "#6B7280",
    lineHeight: 1.6,
  },
});

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

type PdfProps = {
  agencyName: string;
  issuedDate: string;
  targetMonth: string;
  previousMonthPaidAmount: number;
  monthlySystemFee: number;
  settlementFee: number;
  provisionalPayout: number;
  payoutStatus: string;
  paidAt: string | null;
  previousMonthCount: number;
};

function AgencyStatementPdf(props: PdfProps) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.company }, "StarRevenue株式会社"),
          React.createElement(Text, { style: styles.title }, "請求書兼前月領収書"),
          React.createElement(Text, null, `発行日：${props.issuedDate}`),
          React.createElement(Text, null, `対象月：${props.targetMonth}`)
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, null, "代理店名"),
          React.createElement(Text, { style: styles.agencyName }, props.agencyName)
        )
      ),

      React.createElement(
        View,
        { style: styles.cardRow },
        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardLabel }, "前月回収額"),
          React.createElement(
            Text,
            { style: styles.cardValue },
            formatYen(props.previousMonthPaidAmount)
          )
        ),
        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardLabel }, "月額利用料"),
          React.createElement(
            Text,
            { style: styles.cardValue },
            formatYen(props.monthlySystemFee)
          )
        ),
        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardLabel }, "決済手数料 3.0%"),
          React.createElement(
            Text,
            { style: styles.cardValue },
            formatYen(props.settlementFee)
          )
        ),
        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardLabel }, "差引振込予定額"),
          React.createElement(
            Text,
            { style: styles.cardValue },
            formatYen(props.provisionalPayout)
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "明細"),
        React.createElement(
          View,
          { style: styles.table },

          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "項目"),
            React.createElement(Text, { style: styles.td }, "内容")
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "対象月"),
            React.createElement(Text, { style: styles.td }, props.targetMonth)
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "前月入金済件数"),
            React.createElement(Text, { style: styles.td }, `${props.previousMonthCount}件`)
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "月額利用料"),
            React.createElement(Text, { style: styles.td }, formatYen(props.monthlySystemFee))
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "決済手数料"),
            React.createElement(Text, { style: styles.td }, formatYen(props.settlementFee))
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "振込手数料"),
            React.createElement(Text, { style: styles.td }, "別途")
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "差引振込予定額"),
            React.createElement(Text, { style: styles.td }, formatYen(props.provisionalPayout))
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "振込状態"),
            React.createElement(Text, { style: styles.td }, props.payoutStatus)
          ),
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.th }, "振込日"),
            React.createElement(Text, { style: styles.td }, props.paidAt || "-")
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.note },
        React.createElement(Text, null, "※ 本書は請求書兼前月領収書です。"),
        React.createElement(
          Text,
          null,
          "※ 差引振込予定額 ＝ 前月回収額 - 月額利用料11,000円 - 決済手数料3.0%"
        ),
        React.createElement(Text, null, "※ 振込手数料は別途扱いです。")
      )
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const fromEmail = process.env.STATEMENT_FROM_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        { success: false, error: "メール送信環境変数が不足しています" },
        { status: 500 }
      );
    }

    const agencyId = body.agency_id?.trim();
    const agencyName = body.agency_name?.trim();
    const toEmail = body.to_email?.trim();
    const targetMonth = body.target_month?.trim();
    const issuedDate = body.issued_date?.trim();

    if (!agencyId || !agencyName || !toEmail || !targetMonth || !issuedDate) {
      return NextResponse.json(
        { success: false, error: "必須項目が不足しています" },
        { status: 400 }
      );
    }

    const previousMonthPaidAmount = Number(body.previous_month_paid_amount || 0);
    const monthlySystemFee = Number(body.monthly_system_fee || 0);
    const settlementFee = Number(body.settlement_fee || 0);
    const provisionalPayout = Number(body.provisional_payout || 0);
    const payoutStatus = body.payout_status || "未作成";
    const paidAt = body.paid_at || null;
    const previousMonthCount = Number(body.previous_month_count || 0);

    const pdfElement = AgencyStatementPdf({
      agencyName,
      issuedDate,
      targetMonth,
      previousMonthPaidAmount,
      monthlySystemFee,
      settlementFee,
      provisionalPayout,
      payoutStatus,
      paidAt,
      previousMonthCount,
    });

    const pdfBuffer = await renderToBuffer(pdfElement);

    const filename = `statement_${agencyId}_${targetMonth}.pdf`;

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `【StarRevenue】${agencyName}様 ${targetMonth} 請求書兼前月領収書`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.7;">
          <p>${agencyName} 様</p>
          <p>いつもお世話になっております。StarRevenueです。</p>
          <p>${targetMonth}分の請求書兼前月領収書をお送りします。</p>
          <p>添付PDFをご確認ください。</p>
          <p>今後ともよろしくお願いいたします。</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "メール送信に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 }
    );
  }
}