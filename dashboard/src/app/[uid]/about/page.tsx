import { AppHeader } from "@/components/AppHeader";
import { GroupSection } from "@/components/GroupSection";
import { ListRow } from "@/components/ListRow";
import { Info, Bot, User, Code2, Tag, Clock, Database } from "lucide-react";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  const bot = config.botUsername ? `@${config.botUsername}` : "—";
  return (
    <>
      <AppHeader
        title="Tentang"
        subtitle="Info bot & developer"
        icon={<Info size={22} strokeWidth={2.4} />}
      />
      <GroupSection title="Bot">
        <ListRow icon={<Bot size={22} />} title="Nama" value="CheyaVerse" disabled />
        <ListRow icon={<Tag size={22} />} title="Username" value={bot} disabled />
        <ListRow icon={<Code2 size={22} />} title="Versi" value="v1.2.2" disabled />
        <ListRow icon={<Info size={22} />} title="Platform" value="Telegram" disabled />
        <ListRow icon={<Clock size={22} />} title="Status" value="Running" disabled />
      </GroupSection>
      <GroupSection title="Developer">
        <ListRow icon={<User size={22} />} title="Nama" value="M. Syalman Al Farizi" disabled />
        <ListRow icon={<Code2 size={22} />} title="Stack" value="aiogram · Next.js" disabled />
        <ListRow icon={<Database size={22} />} title="Storage" value="Supabase" disabled />
      </GroupSection>
      <p className="text-center text-[11px] text-ink-mute py-3 font-medium">
        Made with ♥ · CheyaVerse
      </p>
    </>
  );
}