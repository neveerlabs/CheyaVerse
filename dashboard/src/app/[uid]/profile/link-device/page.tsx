import { notFound } from "next/navigation";
import { LinkDeviceClient } from "./LinkDeviceClient";

export const dynamic = "force-dynamic";

export default function LinkDevicePage({
  params,
}: {
  params: { uid: string };
}) {
  if (!/^\d+$/.test(params.uid) || Number(params.uid) <= 0) notFound();
  return <LinkDeviceClient uid={params.uid} />;
}
