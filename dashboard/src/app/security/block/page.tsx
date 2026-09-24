import { BlockClient } from "./BlockClient";

export const dynamic = "force-dynamic";

export default function SecurityBlockPage({
  searchParams,
}: {
  searchParams: { uid?: string; fp?: string };
}) {
  return (
    <BlockClient
      uid={searchParams.uid ?? ""}
      fp={searchParams.fp ?? ""}
    />
  );
}
