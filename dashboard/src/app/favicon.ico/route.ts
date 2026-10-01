export const dynamic = "force-static";

export function GET() {
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#080b1c"/><path d="M17 20h30v7H25v5h18v7H25v5h22v7H17z" fill="#fff"/><circle cx="48" cy="17" r="5" fill="#4db7e8"/></svg>`;
  return new Response(icon, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
