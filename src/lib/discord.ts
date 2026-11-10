import { DiscordSDK } from '@discord/embedded-app-sdk';

export const DISCORD_CLIENT_ID = '1569669261331406858';

export function isRunningInsideDiscord(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id');
}

export async function initDiscordSdk(): Promise<DiscordSDK> {
  const sdk = new DiscordSDK(DISCORD_CLIENT_ID);
  await sdk.ready();
  return sdk;
}
