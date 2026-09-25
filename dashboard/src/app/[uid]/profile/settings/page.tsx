import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { SettingsClient } from "./SettingsClient";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function SettingsPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <SubPageHeader
        title="Setting"
        subtitle="Preferensi & konfigurasi"
        backHref={`/${params.uid}/profile`}
      />
      <SettingsClient mediaTtlDays={config.mediaTtlDays} />
    </>
  );
}