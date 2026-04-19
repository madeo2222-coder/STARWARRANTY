import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

declare global {
  // eslint-disable-next-line no-var
  var __supabase_browser_client__:
    | ReturnType<typeof createBrowserClient>
    | undefined;
}

export const supabase =
  globalThis.__supabase_browser_client__ ??
  createBrowserClient(supabaseUrl, supabaseAnonKey);

if (typeof window !== "undefined") {
  globalThis.__supabase_browser_client__ = supabase;
}