import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const DISCORD_CLIENT_ID = '1569669261331406858';
function corsHeaders(_origin: string | null) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405, origin);

  try {
    const { code } = await req.json();
    if (typeof code !== 'string' || code.length < 5 || code.length > 500) {
      return jsonResponse({ error: 'Code Discord invalide.' }, 400, origin);
    }

    const discordClientSecret = Deno.env.get('DISCORD_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
    const secretKeys = secretKeysRaw ? JSON.parse(secretKeysRaw) : {};
    const serviceRoleKey = legacyServiceRoleKey || secretKeys.default;
    if (!discordClientSecret || !supabaseUrl || !serviceRoleKey) {
      console.error('Configuration serveur incomplète.');
      return jsonResponse({ error: 'La configuration serveur est incomplète.' }, 500, origin);
    }

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: discordClientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!tokenResponse.ok) {
      console.error('Discord a refusé le code OAuth.');
      return jsonResponse({ error: 'Discord n’a pas validé la connexion. Réessaie.' }, 401, origin);
    }

    const tokenData = await tokenResponse.json();
    const discordAccessToken = tokenData.access_token as string | undefined;
    if (!discordAccessToken) return jsonResponse({ error: 'Discord n’a pas fourni de jeton.' }, 401, origin);

    const discordUserResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${discordAccessToken}` },
    });
    if (!discordUserResponse.ok) return jsonResponse({ error: 'Impossible de vérifier le compte Discord.' }, 401, origin);
    const discordUser = await discordUserResponse.json();
    const discordUserId = String(discordUser.id);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let matchingUser: any = null;
    for (let page = 1; !matchingUser; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error('Erreur pendant la recherche du compte Supabase.');
        return jsonResponse({ error: 'Impossible de vérifier le compte Sterling.' }, 500, origin);
      }
      const users = data.users || [];
      matchingUser = users.find((user: any) =>
        (user.identities || []).some((identity: any) =>
          identity.provider === 'discord' &&
          (identity.provider_id === discordUserId || identity.identity_data?.sub === discordUserId)
        )
      ) || null;
      if (users.length < 1000) break;
    }

    if (!matchingUser?.email) {
      return jsonResponse({
        error: 'Aucun compte Sterling existant n’est associé à ce Discord. Connecte-toi une première fois depuis le site web avec le bouton Discord, puis réessaie dans l’Activity.',
      }, 403, origin);
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: matchingUser.email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('Impossible de générer la session Supabase.');
      return jsonResponse({ error: 'Impossible d’ouvrir ton compte Sterling.' }, 500, origin);
    }

    return jsonResponse({ access_token: discordAccessToken, supabase_token_hash: tokenHash }, 200, origin);
  } catch (error) {
    console.error('Erreur inattendue dans discord-activity-auth:', error);
    return jsonResponse({ error: 'Une erreur est survenue pendant la connexion.' }, 500, origin);
  }
});
