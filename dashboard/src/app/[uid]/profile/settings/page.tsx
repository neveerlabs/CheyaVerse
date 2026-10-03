import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage({
  params,
  searchParams,
}: {
  params: { uid: string };
  searchParams?: { tab?: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  const requestedTab = searchParams?.tab;
  const tab =
    requestedTab === "general" ||
    requestedTab === "security" ||
    requestedTab === "data" ||
    requestedTab === "github" ||
    requestedTab === "about"
      ? requestedTab
      : "overview";
  const titleByTab = {
    overview: "Settings",
    general: "Account",
    security: "Devices & Security",
    data: "Data",
    github: "GitHub",
    about: "About",
  } as const;

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <SubPageHeader
        title={titleByTab[tab]}
        subtitle={tab === "overview" ? "Preferensi dan konfigurasi akun." : undefined}
        backHref={
          tab === "overview"
            ? `/${params.uid}/profile`
            : `/${params.uid}/profile/settings`
        }
      />
      <SettingsClient uid={params.uid} initialTab={tab} />
    </div>
  );
}