import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

export const DISCORD_CLIENT_ID = '1569669261331406858';
const SUPABASE_HOST = 'hentlmqphwnikbltbjbp.supabase.co';

let discordSdk: DiscordSDK | null = null;
let urlMappingsPatched = false;

export function isRunningInsideDiscord(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id');
}

export async function initDiscordSdk(): Promise<DiscordSDK> {
  // Discord proxyfie les requêtes externes : on associe /supabase
  // au domaine du projet Supabase avant tout appel réseau.
  if (!urlMappingsPatched) {
    patchUrlMappings([{ prefix: '/supabase', target: SUPABASE_HOST }]);
    urlMappingsPatched = true;
  }

  if (!discordSdk) discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
  await discordSdk.ready();
  return discordSdk;
}
