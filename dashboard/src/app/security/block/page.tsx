import { BlockClient } from "./BlockClient";

export const dynamic = "force-dynamic";

export default function SecurityBlockPage({
  searchParams,
}: {
  searchParams: { uid?: string; did?: string };
}) {
  return (
    <BlockClient
      uid={searchParams.uid ?? ""}
      deviceId={searchParams.did ?? ""}
    />
  );
}