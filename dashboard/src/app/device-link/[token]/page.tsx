import { notFound } from "next/navigation";
import { DeviceLinkRedeem } from "./DeviceLinkRedeem";

export const dynamic = "force-dynamic";

export default function DeviceLinkPage({
  params,
}: {
  params: { token: string };
}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.token)) notFound();
  return <DeviceLinkRedeem token={params.token} />;
}
