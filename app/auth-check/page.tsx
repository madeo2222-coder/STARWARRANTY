import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

export default async function AuthCheckPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

 if (profile.role === "headquarters") {
  redirect("/");
}

  if (profile.role === "agency") {
    redirect("/dashboard/agency");
  }

  if (profile.role === "sub_agency") {
    redirect("/dashboard/sub-agency");
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">auth-check</h1>
      <pre className="mt-4 whitespace-pre-wrap text-sm">
        {JSON.stringify(profile, null, 2)}
      </pre>
    </main>
  );
}