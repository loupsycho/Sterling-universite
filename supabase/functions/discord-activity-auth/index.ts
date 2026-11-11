import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const DISCORD_CLIENT_ID = '1569669261331406858';

function corsHeaders(_origin: string | null) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
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
    if (!discordUserResponse.ok) {
      return jsonResponse({ error: 'Impossible de vérifier le compte Discord.' }, 401, origin);
    }

    const discordUser = await discordUserResponse.json();
    const discordUserId = String(discordUser.id);
    const discordUsername = String(discordUser.global_name || discordUser.username || 'Membre');
    const verifiedDiscordEmail =
      discordUser.verified === true && typeof discordUser.email === 'string'
        ? discordUser.email.trim().toLowerCase()
        : null;

    if (!verifiedDiscordEmail) {
      return jsonResponse({
        error: 'Discord n’a pas fourni d’adresse e-mail vérifiée. Autorise l’accès à ton e-mail dans Discord puis réessaie.',
      }, 403, origin);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let matchingDiscordUser: any = null;
    let matchingEmailUser: any = null;

    // Retrouve d'abord un compte déjà associé à cet identifiant Discord,
    // puis un compte Sterling existant avec la même adresse vérifiée.
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error('Erreur pendant la recherche du compte Supabase.');
        return jsonResponse({ error: 'Impossible de vérifier le compte Sterling.' }, 500, origin);
      }

      const users = data.users || [];
      if (!matchingDiscordUser) {
        matchingDiscordUser = users.find((user: any) =>
          (user.identities || []).some((identity: any) =>
            identity.provider === 'discord' &&
            (identity.provider_id === discordUserId || identity.identity_data?.sub === discordUserId)
          ) || user.user_metadata?.discord_id === discordUserId
        ) || null;
      }

      if (!matchingEmailUser) {
        matchingEmailUser = users.find((user: any) =>
          typeof user.email === 'string' &&
          user.email.trim().toLowerCase() === verifiedDiscordEmail
        ) || null;
      }

      if (matchingDiscordUser || matchingEmailUser) break;
      if (users.length < 1000) break;
    }

    let matchingUser = matchingDiscordUser || matchingEmailUser;

    // Première connexion : crée uniquement le compte joueur, en attente.
    // Aucun personnage et aucun droit administrateur ne sont créés ici.
    if (!matchingUser) {
      const { data: createdData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: verifiedDiscordEmail,
        email_confirm: true,
        user_metadata: {
          discord_id: discordUserId,
          discord_username: discordUsername,
        },
      });

      if (createError || !createdData.user) {
        console.error('Impossible de créer le compte joueur initial.', createError);
        return jsonResponse({
          error: 'Impossible de créer ta demande d’inscription. Réessaie ou contacte l’administration.',
        }, 500, origin);
      }

      matchingUser = createdData.user;
    } else {
      // Mémorise l'identifiant Discord après correspondance vérifiée,
      // afin de retrouver le même compte même si l'adresse change plus tard.
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(
        matchingUser.id,
        {
          user_metadata: {
            ...(matchingUser.user_metadata || {}),
            discord_id: discordUserId,
            discord_username: discordUsername,
          },
        }
      );

      if (metadataError) {
        console.error('Impossible de mettre à jour les informations Discord du compte.');
        return jsonResponse({ error: 'Impossible de mettre à jour ton compte Sterling.' }, 500, origin);
      }
    }

    // Toute personne qui n'a pas encore de fiche joueur reçoit une demande
    // en attente. Les statuts existants (accepté/refusé/en attente) sont conservés.
    const { data: existingPlayer, error: playerLookupError } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('id', matchingUser.id)
      .maybeSingle();

    if (playerLookupError) {
      console.error('Impossible de vérifier la fiche joueur.');
      return jsonResponse({ error: 'Impossible de préparer ta demande d’inscription.' }, 500, origin);
    }

    if (!existingPlayer) {
      const { error: playerInsertError } = await supabaseAdmin.from('players').insert({
        id: matchingUser.id,
        discord_username: discordUsername,
        registration_status: 'pending',
      });

      if (playerInsertError) {
        console.error('Impossible de créer la demande joueur.', playerInsertError);
        return jsonResponse({ error: 'Ton compte a été créé, mais la demande d’inscription n’a pas pu être enregistrée. Contacte l’administration.' }, 500, origin);
      }
    } else {
      const { error: playerUpdateError } = await supabaseAdmin
        .from('players')
        .update({ discord_username: discordUsername })
        .eq('id', matchingUser.id);

      if (playerUpdateError) {
        console.error('Impossible de mettre à jour le nom Discord du joueur.');
        return jsonResponse({ error: 'Impossible de mettre à jour ton profil Sterling.' }, 500, origin);
      }
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
