import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { getCover } from "@/lib/storage";
import { CoverClient } from "./CoverClient";

export const dynamic = "force-dynamic";

export default async function CoverPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const cover = await getCover(uid).catch(() => null);

  return (
    <>
      <SubPageHeader
        title="Sampul Profil"
        subtitle="Warna, ikon, atau foto"
        backHref={`/${params.uid}/profile`}
      />
      <CoverClient uid={params.uid} initialCover={cover} />
    </>
  );
}