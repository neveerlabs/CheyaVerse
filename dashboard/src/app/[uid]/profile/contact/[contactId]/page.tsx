import { notFound } from "next/navigation";
import { getCover, getTelegramUser } from "@/lib/storage";
import { ContactProfileClient } from "./ContactProfileClient";

export const dynamic = "force-dynamic";

export default async function ContactProfilePage({
  params,
}: {
  params: { uid: string; contactId: string };
}) {
  const viewerUid = Number(params.uid);
  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(viewerUid) ||
    viewerUid <= 0 ||
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === viewerUid
  ) {
    notFound();
  }

  const [contact, cover] = await Promise.all([
    getTelegramUser(contactUid),
    getCover(contactUid),
  ]);
  if (!contact || contact.role === "deleted") notFound();

  return (
    <ContactProfileClient
      viewerUid={params.uid}
      contact={{
        uid: contact.uid,
        username: contact.username,
        first_name: contact.first_name,
        last_name: contact.last_name,
        photo_url: contact.photo_url,
      }}
      cover={cover}
    />
  );
}
