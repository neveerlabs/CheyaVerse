import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { GroupSection } from "@/components/GroupSection";
import { ListRow } from "@/components/ListRow";
import { BarChart3, Database, CheckCircle2, Clock, HardDrive } from "lucide-react";
import { getStats } from "@/lib/storage";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function StatsPage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  let stats = { total: 0, active: 0, expired: 0 };
  try { stats = await getStats(uid); } catch {}

  return (
    <>
      <AppHeader
        title="Statistik"
        subtitle={`ID ${uid}`}
        icon={<BarChart3 size={22} strokeWidth={2.4} />}
      />
      <div className="grid grid-cols-2 gap-3 mb-7 animate-fade-up">
        <StatCard icon={<Database size={17} />} value={stats.total} label="Total Media" />
        <StatCard icon={<CheckCircle2 size={17} />} value={stats.active} label="Aktif" />
        <div className="col-span-2">
          <StatCard icon={<Clock size={17} />} value={stats.expired} label="Sudah expired" />
        </div>
      </div>
      <GroupSection title="Konfigurasi">
        <ListRow icon={<Clock size={22} />} title="Masa simpan media" value={`${config.mediaTtlDays} hari`} disabled />
        <ListRow icon={<HardDrive size={22} />} title="Storage backend" value="Supabase" disabled />
      </GroupSection>
      <p className="text-center text-[11px] text-ink-mute py-3 font-medium">
        CheyaVerse · v1.4.8
      </p>
    </>
  );
}

function StatCard({
  icon, value, label,
}: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white border border-line p-4">
      <div className="w-8 h-8 rounded-lg bg-[#fafafa] border border-line flex items-center justify-center text-ink mb-2.5">
        {icon}
      </div>
      <div className="text-[28px] font-bold tracking-[-.03em] text-ink leading-none tabular-nums">
        {value.toLocaleString("id-ID")}
      </div>
      <div className="text-[11.5px] font-semibold text-ink-mute mt-1.5">{label}</div>
    </div>
  );
}
