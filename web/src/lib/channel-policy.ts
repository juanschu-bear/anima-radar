export type RadarChannel =
  | "business_published_contact"
  | "instagram_dm_manual"
  | "whatsapp_manual"
  | "telegram_manual"
  | "email";

type ProspectContact = {
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
};

export function detectBestChannel(contact: ProspectContact): RadarChannel {
  const country = normalizeCountry(contact.country);
  const hasEmail = Boolean(normalizeText(contact.email));
  const hasPhone = Boolean(normalizePhone(contact.phone));
  const hasWebsite = Boolean(normalizeText(contact.website));
  const hasInstagram = Boolean(normalizeInstagram(contact.instagram));

  if (country === "CA") {
    if (hasEmail || hasPhone || hasWebsite) return "business_published_contact";
    if (hasInstagram) return "instagram_dm_manual";
    return "business_published_contact";
  }

  if (country === "RU" || country === "KZ" || country === "BY") {
    if (hasPhone) return "whatsapp_manual";
    if (hasEmail) return "email";
    return "business_published_contact";
  }

  if (hasPhone) return "whatsapp_manual";
  if (hasEmail) return "email";
  if (hasInstagram) return "instagram_dm_manual";
  return "business_published_contact";
}

export function buildChannelHref(input: {
  channel: string;
  subject?: string | null;
  body: string;
  contact: ProspectContact;
}) {
  const email = normalizeText(input.contact.email);
  const phone = normalizePhone(input.contact.phone);
  const website = normalizeText(input.contact.website);
  const instagram = normalizeInstagram(input.contact.instagram);

  if (input.channel === "email" && email) {
    const params = new URLSearchParams();
    if (normalizeText(input.subject)) params.set("subject", normalizeText(input.subject)!);
    params.set("body", input.body);
    return `mailto:${email}?${params.toString()}`;
  }

  if (input.channel === "instagram_dm_manual" && instagram) {
    return `https://instagram.com/${instagram.replace(/^@/, "")}`;
  }

  if (
    (input.channel === "whatsapp_manual" || input.channel === "telegram_manual") &&
    phone
  ) {
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(input.body)}`;
  }

  if (input.channel === "business_published_contact") {
    if (email) {
      const params = new URLSearchParams();
      if (normalizeText(input.subject)) params.set("subject", normalizeText(input.subject)!);
      params.set("body", input.body);
      return `mailto:${email}?${params.toString()}`;
    }
    if (phone) return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(input.body)}`;
    if (website) return website;
  }

  return website ?? null;
}

export function labelChannel(
  channel: string,
  text: (english: string, spanish: string) => string,
) {
  switch (channel) {
    case "email":
      return text("Email", "Correo");
    case "whatsapp_manual":
      return "WhatsApp";
    case "instagram_dm_manual":
      return text("Instagram DM", "DM de Instagram");
    case "telegram_manual":
      return "Telegram";
    case "business_published_contact":
    default:
      return text("Published business contact", "Contacto público del negocio");
  }
}

export function describeChannelPolicy(
  country: string | null | undefined,
  text: (english: string, spanish: string) => string,
) {
  const normalized = normalizeCountry(country);
  if (normalized === "CA") {
    return text(
      "Canada mode: use only published business contact paths and keep the sender identifiable.",
      "Modo Canadá: usa solo contactos públicos del negocio y mantén identificable a la persona remitente.",
    );
  }
  if (normalized === "RU" || normalized === "KZ" || normalized === "BY") {
    return text(
      "RU/KZ/BY mode: manual messaging only, with daily first-contact limits.",
      "Modo RU/KZ/BY: solo mensajería manual, con límites diarios de primer contacto.",
    );
  }
  return text(
    "Manual send only: the system prepares the step, but a human still opens the channel.",
    "Solo envío manual: el sistema prepara el paso, pero una persona sigue abriendo el canal.",
  );
}

function normalizeCountry(value: string | null | undefined) {
  return normalizeText(value)?.toUpperCase() ?? null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePhone(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/[^\d+]/g, "") : null;
}

function normalizeInstagram(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}
