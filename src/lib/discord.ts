import { DiscordSDK } from '@discord/embedded-app-sdk';

export const DISCORD_CLIENT_ID = '1569669261331406858';

let discordSdk: DiscordSDK | null = null;

export function isRunningInsideDiscord(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id');
}

export async function initDiscordSdk(): Promise<DiscordSDK> {
  // Le proxy Supabase est configuré dans lib/supabase.ts avant createClient.
  if (!discordSdk) discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
  await discordSdk.ready();
  return discordSdk;
}
