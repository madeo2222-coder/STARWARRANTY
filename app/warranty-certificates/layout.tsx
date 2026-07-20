import { requireHeadquartersPage } from "@/lib/auth/headquarters-server";

export default async function WarrantyCertificatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireHeadquartersPage();
  return children;
}
