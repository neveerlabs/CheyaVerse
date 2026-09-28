import { config } from "@/lib/config";
import { LoginPageClient } from "./LoginPageClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginPageClient botUsername={config.botUsername || null} />;
}
