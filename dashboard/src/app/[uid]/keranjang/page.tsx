import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

export default function KeranjangPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <AppHeader title="Keranjang" subtitle="Belanja kamu di CheyaVerse" />

      <div className="px-1 py-20 text-center animate-fade-up">
        <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
          <ShoppingCart size={22} className="text-ink-mute" strokeWidth={1.8} />
        </div>
        <p className="text-[14.5px] font-medium text-ink mb-1.5">
          Keranjang masih kosong
        </p>
        <p className="text-[12.5px] text-ink-mute font-normal leading-relaxed">
          Belum ada item di keranjang kamu
        </p>
      </div>
    </>
  );
}
