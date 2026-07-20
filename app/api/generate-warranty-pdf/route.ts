import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  HeadquartersAuthError,
  requireHeadquartersBearer,
} from "@/lib/auth/headquarters";
import {
  generateWarrantyPdf,
  WarrantyPdfGenerationError,
} from "@/lib/warranty/generate-warranty-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requirePdfClient(request: Request) {
  const supabase = getAdminClient();
  await requireHeadquartersBearer(request, supabase);
  return supabase;
}

async function generateResponse(
  request: Request,
  certificateId: string,
  supabase: ReturnType<typeof getAdminClient>
) {
  const { buffer, filename } = await generateWarrantyPdf(
    supabase,
    certificateId,
    new URL(request.url).origin
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof HeadquartersAuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof WarrantyPdfGenerationError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  console.error("generate-warranty-pdf route error:", error);
  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "保証書PDF生成中に不明なエラーが発生しました",
    },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const supabase = await requirePdfClient(request);
    const certificateId = new URL(request.url).searchParams.get("id")?.trim();
    if (!certificateId) {
      return NextResponse.json(
        { success: false, error: "id がありません" },
        { status: 400 }
      );
    }
    return await generateResponse(request, certificateId, supabase);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await requirePdfClient(request);
    const body = (await request.json()) as {
      id?: string;
      certificate_id?: string;
    };
    const certificateId = body.id?.trim() || body.certificate_id?.trim();
    if (!certificateId) {
      return NextResponse.json(
        { success: false, error: "id がありません" },
        { status: 400 }
      );
    }
    return await generateResponse(request, certificateId, supabase);
  } catch (error) {
    return errorResponse(error);
  }
}
