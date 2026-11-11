import { AdminCompany } from "@/components/admin/admin-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminCompany id={(await params).id} />;
}
