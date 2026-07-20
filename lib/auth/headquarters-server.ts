import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isHeadquartersEmail } from "@/lib/auth/headquarters";

export async function requireHeadquartersPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  if (!isHeadquartersEmail(user.email)) {
    redirect("/");
  }

  return user;
}
