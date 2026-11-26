const SUPABASE_HOST = 'hentlmqphwnikbltbjbp.supabase.co';

/**
 * Discord Activity must load Supabase Storage images through its configured
 * /supabase URL mapping instead of requesting the Supabase host directly.
 */
export function getDiscordCompatibleImageUrl(
  imageUrl: string | null | undefined
): string | undefined {
  if (!imageUrl) return undefined;

  const isDiscordActivity =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('frame_id');

  if (!isDiscordActivity) return imageUrl;

  try {
    const parsed = new URL(imageUrl);
    if (parsed.hostname !== SUPABASE_HOST) return imageUrl;

    return `/supabase${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return imageUrl;
  }
}
