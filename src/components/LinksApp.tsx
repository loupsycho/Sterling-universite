
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getDiscordCompatibleImageUrl } from "@/lib/imageUrls";

type LinkChoice = {
  category: string;
  type: string;
  reason?: string;
};

type Character = {
  id: string;
  first_name: string;
  name: string;
  avatar_url?: string | null;
};

type Props = {
  characterId: string;
};

const GOLD = "#d4af62";
const PANEL = "#171717";
const BORDER = "rgba(212,175,98,0.22)";

const LINK_OPTIONS = [
  {
    category: "Relation",
    values: ["Couple", "Ambiguë", "Plan d’un soir", "Plan cul"],
  },
  {
    category: "Amitié",
    values: ["Meilleur(e) ami(e)", "Amitié simple", "Ami d’enfance"],
  },
  {
    category: "Rivalité / Ennemis",
    values: ["Rivalité", "Ennemis"],
  },
  {
    category: "Ancienne relation",
    values: ["Ex-couple", "Ex-ami", "Ex-plan cul"],
  },
  {
    category: "Autre",
    values: ["Autre relation"],
  },
];

function toCategory(label: string) {
  if (label === "Relation") return "relation";
  if (label === "Amitié") return "friendship";
  if (label === "Rivalité / Ennemis") return "rivalry";
  if (label === "Ancienne relation") return "past";
  return "other";
}

function characterName(character?: Character | null) {
  if (!character) return "Personnage";
  return `${character.first_name ?? ""} ${character.name ?? ""}`.trim();
}

function Avatar({
  character,
  size = 48,
}: {
  character?: Character | null;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#29251c",
        border: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: GOLD,
        fontWeight: 700,
      }}
    >
      {character?.avatar_url ? (
        <img
          src={getDiscordCompatibleImageUrl(character.avatar_url)}
          alt={characterName(character)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        (character?.first_name?.[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  secondary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: secondary ? `1px solid ${BORDER}` : "1px solid transparent",
        borderRadius: 9,
        padding: "9px 14px",
        background: secondary ? "transparent" : GOLD,
        color: secondary ? GOLD : "#17130c",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "11px 13px",
        borderRadius: 9,
        border: `1px solid ${BORDER}`,
        background: "#101010",
        color: "#f5f1e8",
        outline: "none",
      }}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: 12,
        borderRadius: 9,
        border: `1px solid ${BORDER}`,
        background: "#101010",
        color: "#f5f1e8",
        resize: "vertical",
        outline: "none",
      }}
    />
  );
}

function ChoiceSelector({
  selected,
  onChange,
}: {
  selected: LinkChoice[];
  onChange: (choices: LinkChoice[]) => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [other, setOther] = useState("");

  const toggle = (category: string, type: string) => {
    const exists = selected.some((item) => item.type === type);

    if (exists) {
      onChange(selected.filter((item) => item.type !== type));
    } else {
      onChange([
        ...selected,
        {
          category: toCategory(category),
          type,
          reason: "",
        },
      ]);
    }
  };

  const updateReason = (type: string, reason: string) => {
    setReasons((current) => ({ ...current, [type]: reason }));

    onChange(
      selected.map((item) =>
        item.type === type ? { ...item, reason } : item,
      ),
    );
  };

  const updateOther = (value: string) => {
    setOther(value);

    onChange([
      ...selected.filter(
        (item) => item.category !== "other",
      ),
      ...(value.trim()
        ? [{ category: "other", type: value.trim() }]
        : []),
    ]);
  };

  return (
    <div style={{ display: "grid", gap: 15 }}>
      {LINK_OPTIONS.map((group) => (
        <div key={group.category}>
          <div style={{ color: GOLD, fontWeight: 700, marginBottom: 8 }}>
            {group.category}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {group.values.map((type) => {
              const checked = selected.some((item) => item.type === type);

              return (
                <label
                  key={type}
                  style={{
                    display: "flex",
                    gap: 7,
                    alignItems: "center",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${checked ? GOLD : BORDER}`,
                    background: checked
                      ? "rgba(212,175,98,0.12)"
                      : "#101010",
                    color: "#eee8dc",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(group.category, type)}
                    style={{ accentColor: GOLD }}
                  />
                  {type}
                </label>
              );
            })}
          </div>

          {group.category === "Rivalité / Ennemis" &&
            selected
              .filter((item) => item.category === "rivalry")
              .map((item) => (
                <div key={item.type} style={{ marginTop: 8 }}>
                  <Input
                    value={item.reason ?? reasons[item.type] ?? ""}
                    onChange={(value) => updateReason(item.type, value)}
                    placeholder={`Précise la raison : ${item.type}`}
                  />
                </div>
              ))}
        </div>
      ))}

      {selected.some((item) => item.category === "other") && (
        <Input
          value={other}
          onChange={updateOther}
          placeholder="Précise le type de relation souhaité"
        />
      )}
    </div>
  );
}

export default function LinksApp({ characterId }: Props) {
  const [tab, setTab] = useState("announcements");

  const [characters, setCharacters] = useState<Character[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);

  const [selectedConversation, setSelectedConversation] = useState<any | null>(
    null,
  );

  const [announcementSearch, setAnnouncementSearch] = useState("");
  const [linksSearch, setLinksSearch] = useState("");

  const [presentation, setPresentation] = useState("");
  const [wantedLinks, setWantedLinks] = useState<LinkChoice[]>([]);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);

  const [requestTarget, setRequestTarget] = useState<any | null>(null);
  const [requestLinks, setRequestLinks] = useState<LinkChoice[]>([]);
  const [requestProposal, setRequestProposal] = useState("");

  const [refusalReasons, setRefusalReasons] = useState<
    Record<string, string>
  >({});

  const [messageText, setMessageText] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [changeTarget, setChangeTarget] = useState<any | null>(null);
  const [changeType, setChangeType] = useState<"modify" | "delete">("modify");
  const [changeLinks, setChangeLinks] = useState<LinkChoice[]>([]);
  const [changeExplanation, setChangeExplanation] = useState("");

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );

  const myCharacter = characterMap.get(characterId);

  const notify = (message: string, isError = false) => {
    setError(isError ? message : "");
    setSuccess(isError ? "" : message);
  };

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        charactersResult,
        announcementsResult,
        requestsResult,
        linksResult,
        conversationsResult,
        changeRequestsResult,
      ] = await Promise.all([
        supabase
          .from("characters")
          .select("id, first_name, name, avatar_url"),

        supabase
          .from("link_announcements")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("link_requests")
          .select("*")
          .or(
            `requester_character_id.eq.${characterId},target_character_id.eq.${characterId}`,
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("character_links")
          .select("*")
          .or(
            `character_one_id.eq.${characterId},character_two_id.eq.${characterId}`,
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("link_conversations")
          .select("*, link_requests(*)")
          .order("created_at", { ascending: false }),

        supabase
          .from("link_change_requests")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (charactersResult.error) throw charactersResult.error;
      if (announcementsResult.error) throw announcementsResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (linksResult.error) throw linksResult.error;
      if (conversationsResult.error) throw conversationsResult.error;
      if (changeRequestsResult.error) throw changeRequestsResult.error;

      setCharacters(charactersResult.data ?? []);
      setAnnouncements(announcementsResult.data ?? []);
      setRequests(requestsResult.data ?? []);
      setLinks(linksResult.data ?? []);
      setChangeRequests(changeRequestsResult.data ?? []);

      const myConversations = (conversationsResult.data ?? []).filter(
        (conversation: any) => {
          const request = Array.isArray(conversation.link_requests)
            ? conversation.link_requests[0]
            : conversation.link_requests;

          return (
            request?.requester_character_id === characterId ||
            request?.target_character_id === characterId
          );
        },
      );

      setConversations(myConversations);
    } catch (err: any) {
      notify(err.message ?? "Impossible de charger les données.", true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [characterId]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("link_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      notify(error.message, true);
      return;
    }

    setMessages(data ?? []);
  };

  const publishAnnouncement = async () => {
    if (!wantedLinks.length) {
      notify("Choisis au moins un type de lien.", true);
      return;
    }

    const invalid = wantedLinks.some(
      (item) =>
        (item.category === "rivalry" && !item.reason?.trim()) ||
        (item.category === "other" && !item.type.trim()),
    );

    if (invalid) {
      notify("Précise la raison de la rivalité ou le type de relation.", true);
      return;
    }

    const { error } = await supabase.from("link_announcements").insert({
      character_id: characterId,
      presentation: presentation.trim() || null,
      wanted_links: wantedLinks,
    });

    if (error) {
      notify(error.message, true);
      return;
    }

    setPresentation("");
    setWantedLinks([]);
    setShowAnnouncementForm(false);

    notify("Ton annonce a été publiée !");
    await loadData();
  };

  const deleteAnnouncement = async (announcementId: string) => {
    if (!window.confirm("Supprimer cette annonce ?")) return;

    const { error } = await supabase
      .from("link_announcements")
      .delete()
      .eq("id", announcementId);

    if (error) {
      notify(error.message, true);
      return;
    }

    notify("Annonce supprimée.");
    await loadData();
  };

  const sendRequest = async () => {
    if (!requestTarget || !requestLinks.length) {
      notify("Choisis au moins un lien pour envoyer ta demande.", true);
      return;
    }

    const invalid = requestLinks.some(
      (item) => item.category === "rivalry" && !item.reason?.trim(),
    );

    if (invalid) {
      notify("Précise la raison de la rivalité ou des tensions.", true);
      return;
    }

    const targetCharacterId = requestTarget.character_id;

    if (targetCharacterId === characterId) {
      notify("Tu ne peux pas envoyer une demande à ton propre personnage.", true);
      return;
    }

    const { data: request, error: requestError } = await supabase
      .from("link_requests")
      .insert({
        announcement_id: requestTarget.id,
        requester_character_id: characterId,
        target_character_id: targetCharacterId,
        selected_links: requestLinks,
        proposal: requestProposal.trim() || null,
      })
      .select()
      .single();

    if (requestError) {
      notify(requestError.message, true);
      return;
    }

    const { error: conversationError } = await supabase
      .from("link_conversations")
      .insert({ request_id: request.id });

    if (conversationError) {
      notify(
        "La demande a été créée, mais la discussion n'a pas pu être ouverte : " +
          conversationError.message,
        true,
      );
      return;
    }

    setRequestTarget(null);
    setRequestLinks([]);
    setRequestProposal("");

    notify("Ta demande a été envoyée !");
    await loadData();
  };

  const respondToRequest = async (
    request: any,
    status: "accepted" | "refused",
  ) => {
    const reason = refusalReasons[request.id]?.trim() ?? "";

    if (status === "refused" && !reason) {
      notify("Tu dois expliquer pourquoi tu refuses cette demande.", true);
      return;
    }

    const { error: updateError } = await supabase
      .from("link_requests")
      .update({
        status,
        refusal_reason: status === "refused" ? reason : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (updateError) {
      notify(updateError.message, true);
      return;
    }

    const conversation = conversations.find((item) => {
      const linkedRequest = Array.isArray(item.link_requests)
        ? item.link_requests[0]
        : item.link_requests;

      return linkedRequest?.id === request.id;
    });

    if (status === "accepted") {
      const { error: linkError } = await supabase
        .from("character_links")
        .insert({
          request_id: request.id,
          character_one_id: request.requester_character_id,
          character_two_id: request.target_character_id,
          link_details: request.selected_links,
        });

      if (linkError && !linkError.message.toLowerCase().includes("duplicate")) {
        notify(
          "La demande est acceptée, mais le lien n'a pas pu être créé : " +
            linkError.message,
          true,
        );
        await loadData();
        return;
      }
    }

    if (conversation) {
      const content =
        status === "accepted"
          ? "Cette demande de lien a été acceptée. Votre relation est maintenant ajoutée à vos carnets de liens."
          : `Cette demande de lien a été refusée.\nMotif : ${reason}`;

      await supabase.from("link_messages").insert({
        conversation_id: conversation.id,
        sender_character_id: characterId,
        content,
      });
    }

    notify(status === "accepted" ? "Demande acceptée !" : "Demande refusée.");
    await loadData();
  };

  const sendMessage = async () => {
    if (!selectedConversation || !messageText.trim()) return;

    const { error } = await supabase.from("link_messages").insert({
      conversation_id: selectedConversation.id,
      sender_character_id: characterId,
      content: messageText.trim(),
    });

    if (error) {
      notify(error.message, true);
      return;
    }

    setMessageText("");
    await loadMessages(selectedConversation.id);
  };

  const submitChangeRequest = async () => {
    if (!changeTarget || !changeExplanation.trim()) {
      notify("Ajoute une explication à ta demande.", true);
      return;
    }

    if (changeType === "modify" && !changeLinks.length) {
      notify("Choisis les nouveaux types de lien.", true);
      return;
    }

    const { error } = await supabase.from("link_change_requests").insert({
      link_id: changeTarget.id,
      requested_by_character_id: characterId,
      change_type: changeType,
      proposed_links: changeType === "modify" ? changeLinks : null,
      explanation: changeExplanation.trim(),
    });

    if (error) {
      notify(error.message, true);
      return;
    }

    setChangeTarget(null);
    setChangeLinks([]);
    setChangeExplanation("");

    notify("Ta demande a été envoyée à l'autre personnage.");
    await loadData();
  };

  // Réponse sécurisée via la fonction SQL créée dans Supabase.
  const respondToChangeRequest = async (
    changeRequest: any,
    accepted: boolean,
  ) => {
    const { error } = await supabase.rpc(
      "respond_to_link_change_request",
      {
        p_change_request_id: changeRequest.id,
        p_accept: accepted,
      },
    );

    if (error) {
      notify(error.message, true);
      return;
    }

    notify(
      accepted
        ? changeRequest.change_type === "delete"
          ? "La suppression du lien a été acceptée. Le lien a été supprimé des deux carnets."
          : "La modification du lien a été acceptée."
        : "La demande a été refusée. Le lien reste inchangé.",
    );

    await loadData();
  };

  const filteredAnnouncements = announcements.filter((announcement) => {
    const character = characterMap.get(announcement.character_id);
    const search = announcementSearch.toLowerCase().trim();
    const fullName = characterName(character).toLowerCase();

    return !search || fullName.includes(search);
  });

  const filteredLinks = links.filter((link) => {
    const otherId =
      link.character_one_id === characterId
        ? link.character_two_id
        : link.character_one_id;

    const other = characterMap.get(otherId);

    return characterName(other)
      .toLowerCase()
      .includes(linksSearch.toLowerCase().trim());
  });

  const receivedRequests = requests.filter(
    (request) => request.target_character_id === characterId,
  );

  // Demandes de modification ou de suppression reçues pour les liens de ce personnage.
  const receivedChangeRequests = changeRequests.filter((changeRequest) => {
    const associatedLink = links.find(
      (link) => link.id === changeRequest.link_id,
    );

    return (
      associatedLink &&
      changeRequest.requested_by_character_id !== characterId
    );
  });

  const tabItems = [
    { id: "announcements", label: "Les annonces", icon: "✦" },
    { id: "received", label: "Demandes reçues", icon: "♡" },
    { id: "links", label: "Mes liens", icon: "♧" },
    { id: "discussions", label: "Discussions", icon: "✉" },
  ];

  const panelStyle: React.CSSProperties = {
    background: PANEL,
    border: `1px solid ${BORDER}`,
    borderRadius: 13,
    padding: 15,
    marginBottom: 13,
  };

  if (loading) {
    return (
      <div style={{ color: GOLD, padding: 25, textAlign: "center" }}>
        Chargement de tes liens...
      </div>
    );
  }

  return (
    <div
      style={{
        color: "#f5f1e8",
        background: "#101010",
        minHeight: "100%",
        padding: 16,
        fontFamily: "inherit",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            color: GOLD,
            fontSize: 25,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Liens
        </div>

        <div style={{ color: "#aaa18f", fontSize: 13, marginTop: 4 }}>
          Les relations se construisent à deux.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 7,
          marginBottom: 18,
        }}
      >
        {tabItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setSuccess("");
              setError("");
            }}
            style={{
              padding: "11px 7px",
              borderRadius: 9,
              border: `1px solid ${tab === item.id ? GOLD : BORDER}`,
              background:
                tab === item.id ? "rgba(212,175,98,0.13)" : PANEL,
              color: tab === item.id ? GOLD : "#c7c0b3",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <span style={{ marginRight: 5 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            ...panelStyle,
            color: "#ff9999",
            borderColor: "rgba(255,100,100,0.35)",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div style={{ ...panelStyle, color: GOLD }}>
          {success}
        </div>
      )}

      {tab === "announcements" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              marginBottom: 13,
            }}
          >
            <div style={{ color: GOLD, fontWeight: 700 }}>
              Fil des annonces
            </div>

            <Button
              onClick={() =>
                setShowAnnouncementForm(!showAnnouncementForm)
              }
            >
              {showAnnouncementForm ? "Fermer" : "+ Créer une annonce"}
            </Button>
          </div>

          {showAnnouncementForm && (
            <div style={panelStyle}>
              <h3 style={{ color: GOLD, marginTop: 0 }}>
                Créer mon annonce
              </h3>

              <p style={{ color: "#aaa18f", fontSize: 13 }}>
                Ton annonce sera visible par tous les personnages.
              </p>

              <label
                style={{
                  display: "block",
                  color: GOLD,
                  marginBottom: 7,
                }}
              >
                Présentation (facultatif)
              </label>

              <TextArea
                value={presentation}
                onChange={setPresentation}
                placeholder="Quelques mots sur ton personnage ou les liens recherchés..."
              />

              <div
                style={{
                  color: GOLD,
                  fontWeight: 700,
                  margin: "17px 0 10px",
                }}
              >
                Types de liens recherchés
              </div>

              <ChoiceSelector
                selected={wantedLinks}
                onChange={setWantedLinks}
              />

              <div style={{ marginTop: 17 }}>
                <Button onClick={publishAnnouncement}>
                  Publier l'annonce
                </Button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <Input
              value={announcementSearch}
              onChange={setAnnouncementSearch}
              placeholder="Rechercher par prénom ou nom..."
            />
          </div>

          {filteredAnnouncements.length === 0 && (
            <div
              style={{
                ...panelStyle,
                color: "#aaa18f",
                textAlign: "center",
              }}
            >
              Aucune annonce pour le moment.
            </div>
          )}

          {filteredAnnouncements.map((announcement) => {
            const character = characterMap.get(announcement.character_id);
            const choices = (announcement.wanted_links ?? []) as LinkChoice[];
            const isMine = announcement.character_id === characterId;

            return (
              <div key={announcement.id} style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                  }}
                >
                  <Avatar character={character} size={53} />

                  <div style={{ flex: 1 }}>
                    <div style={{ color: GOLD, fontWeight: 700 }}>
                      {characterName(character)}
                    </div>

                    <div style={{ color: "#8f887b", fontSize: 11 }}>
                      {new Date(
                        announcement.created_at,
                      ).toLocaleDateString("fr-FR")}
                    </div>
                  </div>

                  {isMine && (
                    <Button
                      secondary
                      onClick={() => deleteAnnouncement(announcement.id)}
                    >
                      Supprimer
                    </Button>
                  )}
                </div>

                {announcement.presentation && (
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                      color: "#ddd5c8",
                    }}
                  >
                    {announcement.presentation}
                  </p>
                )}

                <div
                  style={{
                    color: GOLD,
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  LIENS RECHERCHÉS
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {choices.map((choice, index) => (
                    <span
                      key={`${choice.type}-${index}`}
                      style={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 20,
                        padding: "5px 9px",
                        fontSize: 11,
                        color: "#e7dfd0",
                      }}
                    >
                      {choice.type}
                      {choice.reason ? ` — ${choice.reason}` : ""}
                    </span>
                  ))}
                </div>

                {!isMine && (
                  <div style={{ marginTop: 14 }}>
                    <Button
                      onClick={() => {
                        setRequestTarget(announcement);
                        setRequestLinks([]);
                        setRequestProposal("");
                      }}
                    >
                      Proposer un lien
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {requestTarget && (
            <div style={panelStyle}>
              <h3 style={{ color: GOLD, marginTop: 0 }}>
                Proposer un lien à{" "}
                {characterName(
                  characterMap.get(requestTarget.character_id),
                )}
              </h3>

              <div
                style={{
                  color: "#aaa18f",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Sélectionne un ou plusieurs liens parmi ceux proposés dans son
                annonce.
              </div>

              <ChoiceSelector
                selected={requestLinks}
                onChange={setRequestLinks}
              />

              <div
                style={{
                  color: GOLD,
                  fontWeight: 700,
                  margin: "16px 0 7px",
                }}
              >
                Ajouter une proposition (facultatif)
              </div>

              <TextArea
                value={requestProposal}
                onChange={setRequestProposal}
                placeholder="Présente ton idée de lien..."
              />

              <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                <Button onClick={sendRequest}>
                  Envoyer la demande
                </Button>

                <Button
                  secondary
                  onClick={() => setRequestTarget(null)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "received" && (
        <>
          <div style={{ color: GOLD, fontWeight: 700, marginBottom: 13 }}>
            Demandes adressées à {characterName(myCharacter)}
          </div>

          {receivedRequests.length === 0 &&
            receivedChangeRequests.length === 0 && (
              <div
                style={{
                  ...panelStyle,
                  color: "#aaa18f",
                  textAlign: "center",
                }}
              >
                Tu n'as reçu aucune demande pour le moment.
              </div>
            )}

          {receivedRequests.map((request) => {
            const sender = characterMap.get(request.requester_character_id);
            const choices = (request.selected_links ?? []) as LinkChoice[];

            return (
              <div key={request.id} style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar character={sender} />

                  <div>
                    <div style={{ color: GOLD, fontWeight: 700 }}>
                      {characterName(sender)}
                    </div>

                    <div style={{ color: "#999080", fontSize: 11 }}>
                      {new Date(request.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </div>

                  <span
                    style={{
                      marginLeft: "auto",
                      color: request.status === "pending" ? GOLD : "#aaa18f",
                      fontSize: 11,
                    }}
                  >
                    {request.status === "pending"
                      ? "En attente"
                      : request.status === "accepted"
                        ? "Acceptée"
                        : "Refusée"}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 13,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {choices.map((choice, index) => (
                    <span
                      key={`${choice.type}-${index}`}
                      style={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 20,
                        padding: "5px 9px",
                        fontSize: 11,
                      }}
                    >
                      {choice.type}
                      {choice.reason ? ` — ${choice.reason}` : ""}
                    </span>
                  ))}
                </div>

                {request.proposal && (
                  <p style={{ color: "#ddd5c8", whiteSpace: "pre-wrap" }}>
                    {request.proposal}
                  </p>
                )}

                {request.status === "pending" && (
                  <div style={{ marginTop: 14, display: "grid", gap: 9 }}>
                    <TextArea
                      value={refusalReasons[request.id] ?? ""}
                      onChange={(value) =>
                        setRefusalReasons((current) => ({
                          ...current,
                          [request.id]: value,
                        }))
                      }
                      placeholder="Motif obligatoire si tu refuses la demande..."
                    />

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <Button
                        onClick={() =>
                          respondToRequest(request, "accepted")
                        }
                      >
                        Accepter
                      </Button>

                      <Button
                        secondary
                        onClick={() =>
                          respondToRequest(request, "refused")
                        }
                      >
                        Refuser
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {receivedChangeRequests.length > 0 && (
            <>
              <div
                style={{
                  color: GOLD,
                  fontWeight: 700,
                  marginTop: 22,
                  marginBottom: 12,
                }}
              >
                Demandes concernant tes liens
              </div>

              {receivedChangeRequests.map((changeRequest) => {
                const associatedLink = links.find(
                  (link) => link.id === changeRequest.link_id,
                );

                const sender = characterMap.get(
                  changeRequest.requested_by_character_id,
                );

                const proposedLinks = (changeRequest.proposed_links ??
                  []) as LinkChoice[];

                return (
                  <div
                    key={changeRequest.id}
                    style={{
                      ...panelStyle,
                      borderColor:
                        changeRequest.status === "pending"
                          ? GOLD
                          : BORDER,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar character={sender} />

                      <div style={{ flex: 1 }}>
                        <div style={{ color: GOLD, fontWeight: 700 }}>
                          {characterName(sender)}
                        </div>

                        <div
                          style={{
                            color: "#999080",
                            fontSize: 11,
                            marginTop: 3,
                          }}
                        >
                          {new Date(
                            changeRequest.created_at,
                          ).toLocaleDateString("fr-FR")}
                        </div>
                      </div>

                      <span
                        style={{
                          color:
                            changeRequest.status === "pending"
                              ? GOLD
                              : "#aaa18f",
                          fontSize: 11,
                        }}
                      >
                        {changeRequest.status === "pending"
                          ? "En attente"
                          : changeRequest.status === "accepted"
                            ? "Acceptée"
                            : "Refusée"}
                      </span>
                    </div>

                    <div
                      style={{
                        color: GOLD,
                        fontWeight: 700,
                        marginTop: 15,
                      }}
                    >
                      {changeRequest.change_type === "delete"
                        ? "Demande de suppression du lien"
                        : "Demande de modification du lien"}
                    </div>

                    {associatedLink && (
                      <div
                        style={{
                          color: "#aaa18f",
                          fontSize: 12,
                          marginTop: 7,
                        }}
                      >
                        Lien concerné :
                        {" "}
                        {(associatedLink.link_details ?? [])
                          .map((detail: LinkChoice) => detail.type)
                          .join(", ")}
                      </div>
                    )}

                    {changeRequest.change_type === "modify" && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 10,
                        }}
                      >
                        {proposedLinks.map((detail, index) => (
                          <span
                            key={`${detail.type}-${index}`}
                            style={{
                              border: `1px solid ${BORDER}`,
                              borderRadius: 20,
                              padding: "5px 9px",
                              fontSize: 11,
                            }}
                          >
                            {detail.type}
                          </span>
                        ))}
                      </div>
                    )}

                    {changeRequest.explanation && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 11,
                          background: "#101010",
                          borderRadius: 8,
                          color: "#ddd5c8",
                          whiteSpace: "pre-wrap",
                          fontSize: 13,
                        }}
                      >
                        {changeRequest.explanation}
                      </div>
                    )}

                    {changeRequest.status === "pending" && (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 14,
                        }}
                      >
                        <Button
                          onClick={() =>
                            respondToChangeRequest(changeRequest, true)
                          }
                        >
                          Accepter
                        </Button>

                        <Button
                          secondary
                          onClick={() =>
                            respondToChangeRequest(changeRequest, false)
                          }
                        >
                          Refuser
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {tab === "links" && (
        <>
          <div style={{ color: GOLD, fontWeight: 700, marginBottom: 12 }}>
            Mon carnet de liens
          </div>

          <div style={{ marginBottom: 14 }}>
            <Input
              value={linksSearch}
              onChange={setLinksSearch}
              placeholder="Rechercher par prénom ou nom..."
            />
          </div>

          {filteredLinks.length === 0 && (
            <div
              style={{
                ...panelStyle,
                color: "#aaa18f",
                textAlign: "center",
              }}
            >
              Tu n'as pas encore de lien accepté.
            </div>
          )}

          {filteredLinks.map((link) => {
            const otherId =
              link.character_one_id === characterId
                ? link.character_two_id
                : link.character_one_id;

            const other = characterMap.get(otherId);
            const details = (link.link_details ?? []) as LinkChoice[];

            const hasPendingChange = changeRequests.some(
              (request) =>
                request.link_id === link.id &&
                request.status === "pending",
            );

            return (
              <div key={link.id} style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                  }}
                >
                  <Avatar character={other} size={52} />

                  <div style={{ flex: 1 }}>
                    <div style={{ color: GOLD, fontWeight: 700 }}>
                      {characterName(other)}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 5,
                        marginTop: 6,
                      }}
                    >
                      {details.map((detail, index) => (
                        <span
                          key={`${detail.type}-${index}`}
                          style={{
                            border: `1px solid ${BORDER}`,
                            borderRadius: 20,
                            padding: "4px 8px",
                            fontSize: 11,
                          }}
                        >
                          {detail.type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {hasPendingChange && (
                  <div
                    style={{
                      color: GOLD,
                      fontSize: 12,
                      marginTop: 12,
                    }}
                  >
                    Une demande de modification ou de suppression est en attente.
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 13,
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    secondary
                    onClick={() => {
                      setChangeTarget(link);
                      setChangeType("modify");
                      setChangeLinks(details);
                      setChangeExplanation("");
                    }}
                    disabled={hasPendingChange}
                  >
                    Modifier le lien
                  </Button>

                  <Button
                    secondary
                    onClick={() => {
                      setChangeTarget(link);
                      setChangeType("delete");
                      setChangeLinks([]);
                      setChangeExplanation("");
                    }}
                    disabled={hasPendingChange}
                  >
                    Demander la suppression
                  </Button>
                </div>
              </div>
            );
          })}

          {changeTarget && (
            <div style={panelStyle}>
              <h3 style={{ color: GOLD, marginTop: 0 }}>
                {changeType === "modify"
                  ? "Proposer une modification"
                  : "Demander la suppression"}
              </h3>

              <div
                style={{
                  color: "#aaa18f",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                L'autre personnage devra donner son accord avant que le lien
                soit modifié ou supprimé.
              </div>

              {changeType === "modify" && (
                <ChoiceSelector
                  selected={changeLinks}
                  onChange={setChangeLinks}
                />
              )}

              <div
                style={{
                  margin: "14px 0 7px",
                  color: GOLD,
                  fontWeight: 700,
                }}
              >
                Explication
              </div>

              <TextArea
                value={changeExplanation}
                onChange={setChangeExplanation}
                placeholder="Explique ta demande..."
              />

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button onClick={submitChangeRequest}>
                  Envoyer la demande
                </Button>

                <Button
                  secondary
                  onClick={() => setChangeTarget(null)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "discussions" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 12,
          }}
        >
          {!selectedConversation ? (
            <>
              <div style={{ color: GOLD, fontWeight: 700 }}>
                Mes discussions
              </div>

              {conversations.length === 0 && (
                <div
                  style={{
                    ...panelStyle,
                    color: "#aaa18f",
                    textAlign: "center",
                  }}
                >
                  Aucune discussion pour le moment.
                </div>
              )}

              {conversations.map((conversation) => {
                const request = Array.isArray(conversation.link_requests)
                  ? conversation.link_requests[0]
                  : conversation.link_requests;

                const otherId =
                  request?.requester_character_id === characterId
                    ? request?.target_character_id
                    : request?.requester_character_id;

                const other = characterMap.get(otherId);

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversation(conversation)}
                    style={{
                      ...panelStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      width: "100%",
                      color: "#f5f1e8",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <Avatar character={other} />

                    <div>
                      <div style={{ color: GOLD, fontWeight: 700 }}>
                        {characterName(other)}
                      </div>

                      <div style={{ color: "#999080", fontSize: 11 }}>
                        {request?.status === "accepted"
                          ? "Lien accepté"
                          : request?.status === "refused"
                            ? "Demande refusée"
                            : "Demande en attente"}
                      </div>
                    </div>

                    <span
                      style={{
                        marginLeft: "auto",
                        color: GOLD,
                      }}
                    >
                      ›
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <div style={panelStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 15,
                }}
              >
                <Button
                  secondary
                  onClick={() => setSelectedConversation(null)}
                >
                  ← Retour
                </Button>

                <div style={{ color: GOLD, fontWeight: 700 }}>
                  Discussion
                </div>
              </div>

              <div
                style={{
                  maxHeight: 390,
                  overflowY: "auto",
                  display: "grid",
                  gap: 9,
                  marginBottom: 14,
                }}
              >
                {messages.map((message) => {
                  const mine = message.sender_character_id === characterId;

                  return (
                    <div
                      key={message.id}
                      style={{
                        justifySelf: mine ? "end" : "start",
                        maxWidth: "85%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: mine
                          ? "rgba(212,175,98,0.17)"
                          : "#242424",
                        border: `1px solid ${BORDER}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: GOLD,
                          marginBottom: 5,
                        }}
                      >
                        {mine
                          ? "Moi"
                          : characterName(
                              characterMap.get(message.sender_character_id),
                            )}
                      </div>

                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {message.content}
                      </div>

                      <div
                        style={{
                          fontSize: 9,
                          color: "#8f887b",
                          marginTop: 5,
                          textAlign: "right",
                        }}
                      >
                        {new Date(message.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                  );
                })}
              </div>

              <TextArea
                value={messageText}
                onChange={setMessageText}
                placeholder="Écrire un message..."
              />

              <div style={{ marginTop: 9 }}>
                <Button onClick={sendMessage}>Envoyer</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <button
          onClick={loadData}
          style={{
            background: "transparent",
            border: "none",
            color: "#9c927f",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ↻ Actualiser
        </button>
      </div>
    </div>
  );
}
