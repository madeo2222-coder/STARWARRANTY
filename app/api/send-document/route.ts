import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { to_email, subject, html } = body;

    if (!to_email || !html) {
      return NextResponse.json(
        { success: false, error: "missing params" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [to_email],
      subject: subject || "帳票送付",
      html,
    });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { success: false, error: "send failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: "server error" },
      { status: 500 }
    );
  }
}