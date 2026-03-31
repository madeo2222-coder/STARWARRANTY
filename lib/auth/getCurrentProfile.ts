import { createClient } from "@/lib/supabase/server";

export type AppRole = "headquarters" | "agency" | "sub_agency";

export type CurrentProfile = {
  userId: string;
  role: AppRole;
  agency_id: string | null;
};

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId: user.id,
    role: data.role as AppRole,
    agency_id: data.agency_id,
  };
}