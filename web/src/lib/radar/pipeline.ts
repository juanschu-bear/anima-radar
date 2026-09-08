import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type TenantRecord = {
  id: string;
  name: string;
  default_market_lang: string;
};

type ScanRecord = {
  id: string;
  city: string;
  country: string;
  radius_m: number;
  categories: string[];
  sources: string[];
};

type RawAnswers = Record<string, string>;

type ProspectCandidate = {
  source: string;
  source_id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  rating: number | null;
  review_count: number | null;
  raw: Record<string, unknown>;
  enrichment: Record<string, unknown>;
  score: number;
  score_reasons: string[];
  best_channel: string;
  status: "new" | "approved" | "discarded" | "sent" | "replied" | "converted" | "lost";
};

type ProspectRecord = ProspectCandidate & {
  id: string;
  tenant_id: string;
  scan_id: string;
};

type OutcomeKind = "replied_positive" | "replied_negative" | "no_reply" | "meeting" | "order" | "lost";

const GOOGLE_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.types",
  "places.businessStatus",
].join(",");

const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";

export async function processScanPipeline({
  admin,
  tenant,
  profile,
  scan,
  jobId,
}: {
  admin: AdminClient;
  tenant: TenantRecord;
  profile: { id: string; raw_answers: RawAnswers };
  scan: ScanRecord;
  jobId?: string;
}) {
  await updateScanState(admin, scan.id, { status: "discovering", started_at: new Date().toISOString(), error: null });
  if (jobId) await updateJobState(admin, jobId, { status: "running", locked_at: new Date().toISOString(), error: null });

  try {
    const discovered = await discoverProspects(scan, tenant.default_market_lang);
    const prospects = scoreAndNormalizeProspects(discovered, {
      answers: profile.raw_answers,
      tenant,
      scan,
    });

    if (prospects.length) {
      const rows = prospects.map((prospect) => ({
        tenant_id: tenant.id,
        scan_id: scan.id,
        ...prospect,
      }));
      const { error } = await admin
        .from("prospects")
        .upsert(rows, { onConflict: "tenant_id,source,source_id" })
        .select("id,tenant_id,scan_id,source,source_id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,raw,enrichment,score,score_reasons,best_channel,status");
      if (error) throw new Error(error.message);
    }

    const counts = {
      found: discovered.length,
      unique: prospects.length,
      enriched: prospects.filter((item) => item.website || item.phone).length,
      scored: prospects.length,
      drafted: 0,
    };

    await updateScanState(admin, scan.id, {
      status: "done",
      counts,
      finished_at: new Date().toISOString(),
      error: null,
    });
    if (jobId) await updateJobState(admin, jobId, { status: "done", locked_at: null, error: null });

    return counts;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The scan failed";
    await updateScanState(admin, scan.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error: detail,
    });
    if (jobId) await updateJobState(admin, jobId, { status: "failed", locked_at: null, error: detail });
    throw error;
  }
}

export async function createManualProspect({
  admin,
  tenant,
  payload,
  profile,
}: {
  admin: AdminClient;
  tenant: TenantRecord;
  payload: {
    name: string;
    city?: string;
    country?: string;
    category?: string;
    website?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    note?: string;
  };
  profile: { raw_answers: RawAnswers } | null;
}) {
  const scanId = await ensureManualScan(admin, tenant.id, payload.city, payload.country);
  const candidate = scoreProspect(
    {
      source: "manual",
      source_id: randomUUID(),
      name: payload.name,
      category: payload.category ?? null,
      address: null,
      city: payload.city ?? null,
      country: payload.country ?? null,
      website: normalizeUrl(payload.website),
      phone: normalizeOptional(payload.phone),
      email: normalizeOptional(payload.email),
      instagram: normalizeOptional(payload.instagram),
      rating: null,
      review_count: null,
      raw: { manual_note: normalizeOptional(payload.note) ?? "", created_via: "manual" },
      enrichment: { mode: "manual" },
    },
    profile?.raw_answers ?? {},
    tenant,
    { id: scanId, city: payload.city ?? "", country: payload.country ?? "", radius_m: 0, categories: payload.category ? [payload.category] : [], sources: ["manual"] },
  );

  const { data, error } = await admin
    .from("prospects")
    .insert({
      tenant_id: tenant.id,
      scan_id: scanId,
      ...candidate,
    })
    .select("id,tenant_id,scan_id,source,source_id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,raw,enrichment,score,score_reasons,best_channel,status")
    .single();

  if (error) throw new Error(error.message);
  return data as ProspectRecord;
}

export async function createOrRefreshMessageDraft({
  admin,
  tenant,
  profileAnswers,
  prospect,
  authorName,
}: {
  admin: AdminClient;
  tenant: TenantRecord;
  profileAnswers: RawAnswers;
  prospect: ProspectRecord;
  authorName?: string | null;
}) {
  const drafts = buildDraftSequence({ tenant, profileAnswers, prospect, authorName });
  const { error } = await admin
    .from("messages")
    .upsert(
      drafts.map((draft) => ({
        tenant_id: tenant.id,
        prospect_id: prospect.id,
        step: draft.step,
        lang: draft.lang,
        channel: draft.channel,
        subject: draft.subject,
        body: draft.body,
        generated_body: draft.body,
        edited: false,
        due_at: draft.due_at,
      })),
      { onConflict: "prospect_id,step" },
    )
    .select("id");

  if (error) throw new Error(error.message);
  const { data, error: selectError } = await admin
    .from("messages")
    .select("id,prospect_id,step,lang,channel,subject,body,due_at,sent_at,created_at,edited")
    .eq("tenant_id", tenant.id)
    .eq("prospect_id", prospect.id)
    .order("step", { ascending: true });
  if (selectError) throw new Error(selectError.message);
  return data ?? [];
}

export function buildDraftMessage({
  tenant,
  profileAnswers,
  prospect,
  authorName,
}: {
  tenant: TenantRecord;
  profileAnswers: RawAnswers;
  prospect: {
    id?: string;
    name: string;
    city: string | null;
    country: string | null;
    category: string | null;
    website: string | null;
    score_reasons: string[];
    best_channel: string;
  };
  authorName?: string | null;
}) {
  const language = preferredLanguage(tenant.default_market_lang, profileAnswers);
  const offer = firstSentence(profileAnswers["answer-1"]);
  const difference = firstSentence(profileAnswers["answer-5"]);
  const proof = firstSentence(profileAnswers["answer-6"]);
  const followUp = firstSentence(profileAnswers["answer-8"]) || (language === "es" ? "Si tiene sentido, coordinamos una llamada breve." : "If it feels relevant, we can set up a short call.");
  const signal = prospect.score_reasons[0] ?? (language === "es" ? "hay una posible afinidad comercial" : "there may be a genuine commercial fit");
  const signedBy = extractSignerName(profileAnswers["answer-7"]) || authorName || tenant.name;
  const intro =
    language === "es"
      ? `Hola ${prospect.name}, vi ${signal}.`
      : `Hi ${prospect.name}, I noticed ${signal}.`;
  const value =
    language === "es"
      ? `${tenant.name} ayuda con ${offer || "un proceso comercial mejor enfocado"}. ${difference ? `Nuestro ángulo es ${difference}.` : ""} ${proof ? `La prueba que más repetimos es ${proof}.` : ""}`
      : `${tenant.name} helps with ${offer || "a more focused commercial workflow"}. ${difference ? `Our edge is ${difference}.` : ""} ${proof ? `The proof we rely on most is ${proof}.` : ""}`;
  const context =
    language === "es"
      ? [prospect.category, prospect.city].filter(Boolean).join(" · ")
      : [prospect.category, prospect.city].filter(Boolean).join(" · ");
  const ask = language === "es" ? followUp : followUp;

  return {
    lang: language,
    channel: prospect.best_channel || "business_published_contact",
    subject: language === "es" ? `Idea para ${prospect.name}` : `Idea for ${prospect.name}`,
    body: [intro, context ? context : null, value.trim(), ask, language === "es" ? `Saludos,\n${signedBy}` : `Best,\n${signedBy}`].filter(Boolean).join("\n\n"),
  };
}

function buildDraftSequence({
  tenant,
  profileAnswers,
  prospect,
  authorName,
}: {
  tenant: TenantRecord;
  profileAnswers: RawAnswers;
  prospect: ProspectRecord;
  authorName?: string | null;
}) {
  const primary = buildDraftMessage({ tenant, profileAnswers, prospect, authorName });
  const signer = extractSignerName(profileAnswers["answer-7"]) || authorName || tenant.name;
  const language = primary.lang;
  const checkIn = language === "es"
    ? `Retomo esta nota por si ahora sí encaja revisar ${tenant.name} para ${prospect.name}.`
    : `Following up in case now is a better moment to review ${tenant.name} for ${prospect.name}.`;
  const addedReason = prospect.score_reasons[1] ?? (language === "es" ? "también vimos una afinidad adicional con tu mercado" : "we also noticed another signal that fits your market");
  const closer = firstSentence(profileAnswers["answer-8"]) || (language === "es" ? "Si te sirve, coordinamos una llamada breve." : "If it helps, we can set up a short call.");
  const finalNudge = language === "es"
    ? `Último seguimiento breve: ${addedReason}.`
    : `One last short follow-up: ${addedReason}.`;
  return [
    { step: 1, due_at: null, ...primary },
    {
      step: 2,
      due_at: addDays(3),
      lang: language,
      channel: primary.channel,
      subject: primary.subject,
      body: [checkIn, addedReason, closer, language === "es" ? `Saludos,\n${signer}` : `Best,\n${signer}`].join("\n\n"),
    },
    {
      step: 3,
      due_at: addDays(7),
      lang: language,
      channel: primary.channel,
      subject: primary.subject,
      body: [finalNudge, closer, language === "es" ? `Gracias,\n${signer}` : `Thanks,\n${signer}`].join("\n\n"),
    },
  ];
}

export function prospectStatusFromOutcome(kind: OutcomeKind) {
  switch (kind) {
    case "replied_positive":
    case "meeting":
      return "replied";
    case "order":
      return "converted";
    case "replied_negative":
    case "lost":
      return "lost";
    case "no_reply":
    default:
      return "sent";
  }
}

export function businessEventKindFromOutcome(kind: OutcomeKind) {
  switch (kind) {
    case "replied_positive":
    case "replied_negative":
    case "no_reply":
      return "reply";
    case "meeting":
      return "meeting";
    case "order":
      return "paid_order";
    case "lost":
    default:
      return "lost";
  }
}

export function buildChannelUrl(message: {
  channel: string;
  subject: string | null;
  body: string;
  prospects:
    | { email?: string | null; phone?: string | null; website?: string | null }
    | Array<{ email?: string | null; phone?: string | null; website?: string | null }>
    | null;
}) {
  const prospect = Array.isArray(message.prospects) ? message.prospects[0] ?? null : message.prospects;
  const email = normalizeOptional(prospect?.email);
  const phone = normalizePhone(prospect?.phone);
  if (message.channel === "email" && email) {
    const params = new URLSearchParams();
    if (message.subject) params.set("subject", message.subject);
    params.set("body", message.body);
    return `mailto:${email}?${params.toString()}`;
  }
  if ((message.channel === "whatsapp_manual" || message.channel === "business_published_contact") && phone) {
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message.body)}`;
  }
  return prospect?.website ?? null;
}

async function discoverProspects(scan: ScanRecord, defaultMarketLang: string) {
  const sources = new Set(scan.sources.length ? scan.sources : ["google_places"]);
  const results: ProspectSeed[] = [];
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  if (sources.has("google_places") && googleKey) {
    results.push(...await searchGooglePlaces({
      apiKey: googleKey,
      scan,
      languageCode: defaultMarketLang.startsWith("es") ? "es" : "en",
    }));
  }

  if (sources.has("exa") && exaKey) {
    results.push(...await searchExa({ apiKey: exaKey, scan }));
  }

  return dedupeProspectSeeds(results);
}

type ProspectSeed = Omit<ProspectCandidate, "score" | "score_reasons" | "best_channel" | "status" | "enrichment"> & {
  enrichment?: Record<string, unknown>;
};

function scoreAndNormalizeProspects(discovered: ProspectSeed[], context: {
  answers: RawAnswers;
  tenant: TenantRecord;
  scan: ScanRecord;
}) {
  return discovered
    .map((seed) => scoreProspect(seed, context.answers, context.tenant, context.scan))
    .sort((left, right) => right.score - left.score)
    .slice(0, 100);
}

function scoreProspect(seed: ProspectSeed, answers: RawAnswers, tenant: TenantRecord, scan: ScanRecord): ProspectCandidate {
  const neverFit = normalizeTokens(answers["answer-3"]);
  const growth = normalizeTokens(answers["answer-4"]);
  const differentiators = normalizeTokens(answers["answer-5"]);
  const proof = normalizeTokens(answers["answer-6"]);
  const haystack = normalizeTokens([
    seed.name,
    seed.category,
    seed.address,
    seed.city,
    seed.country,
    seed.website,
    JSON.stringify(seed.raw),
  ].filter(Boolean).join(" "));

  let score = 45;
  const reasons: string[] = [];

  const blocked = neverFit.some((token) => token.length > 3 && haystack.includes(token));
  if (blocked) {
    score -= 35;
    reasons.push("Matches a 'never fit' exclusion from Business DNA");
  }

  const growthMatches = growth.filter((token) => token.length > 3 && haystack.includes(token));
  if (growthMatches.length) {
    score += Math.min(14, growthMatches.length * 4);
    reasons.push(`Aligned with the growth market: ${growthMatches.slice(0, 2).join(", ")}`);
  }

  const categoryMatches = [...differentiators, ...proof].filter((token) => token.length > 4 && haystack.includes(token));
  if (categoryMatches.length) {
    score += Math.min(15, categoryMatches.length * 3);
    reasons.push(`Evidence echoes your positioning: ${categoryMatches.slice(0, 2).join(", ")}`);
  }

  if (seed.website) {
    score += 8;
    reasons.push("Has a public website for research and outreach");
  }

  if (seed.phone || seed.email) {
    score += 8;
    reasons.push("A direct contact path is available");
  }

  if (typeof seed.rating === "number") {
    score += Math.min(8, Math.round(seed.rating));
  }

  if (typeof seed.review_count === "number" && seed.review_count > 0) {
    score += Math.min(8, Math.ceil(Math.log10(seed.review_count + 1) * 4));
    if (reasons.length < 3) reasons.push(`Public reputation is visible through ${seed.review_count} reviews`);
  }

  if (scan.city && seed.city?.toLowerCase() === scan.city.toLowerCase()) {
    score += 6;
    if (reasons.length < 3) reasons.push(`Located inside the active market: ${scan.city}`);
  }

  score = clamp(score, 8, 98);

  while (reasons.length < 3) {
    reasons.push(fallbackReason(reasons.length, seed, tenant));
  }

  return {
    source: seed.source,
    source_id: seed.source_id,
    name: seed.name,
    category: seed.category,
    address: seed.address,
    city: seed.city,
    country: seed.country,
    website: seed.website,
    phone: seed.phone,
    email: seed.email,
    instagram: seed.instagram,
    rating: seed.rating,
    review_count: seed.review_count,
    raw: seed.raw,
    enrichment: seed.enrichment ?? { mode: "live-discovery" },
    score,
    score_reasons: reasons.slice(0, 3),
    best_channel: detectBestChannel(seed),
    status: "new",
  };
}

function fallbackReason(index: number, seed: ProspectSeed, tenant: TenantRecord) {
  if (index === 0) return `${tenant.name} can now review this company with real market context`;
  if (index === 1 && seed.category) return `Public category signal: ${seed.category}`;
  return "Captured from a live company search instead of mock data";
}

function detectBestChannel(seed: ProspectSeed) {
  if (seed.email) return "email";
  if (seed.phone) return "whatsapp_manual";
  if (seed.website) return "business_published_contact";
  return "business_published_contact";
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function searchGooglePlaces({
  apiKey,
  scan,
  languageCode,
}: {
  apiKey: string;
  scan: ScanRecord;
  languageCode: string;
}) {
  const records: ProspectSeed[] = [];
  for (const category of scan.categories.slice(0, 6)) {
    const response = await fetch(GOOGLE_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${category} in ${scan.city}, ${scan.country}`,
        languageCode,
        pageSize: 8,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Places error: ${detail.slice(0, 180)}`);
    }

    const payload = await response.json() as {
      places?: Array<Record<string, unknown>>;
    };

    for (const place of payload.places ?? []) {
      const displayName = typeof (place.displayName as { text?: unknown } | undefined)?.text === "string"
        ? (place.displayName as { text: string }).text
        : "Unnamed place";
      const website = normalizeUrl(typeof place.websiteUri === "string" ? place.websiteUri : null);
      records.push({
        source: "google_places",
        source_id: String(place.id ?? displayName),
        name: displayName,
        category: typeof place.primaryType === "string" ? place.primaryType : category,
        address: typeof place.formattedAddress === "string" ? place.formattedAddress : null,
        city: extractCity(typeof place.formattedAddress === "string" ? place.formattedAddress : null, scan.city),
        country: scan.country,
        website,
        phone: normalizeOptional(typeof place.nationalPhoneNumber === "string" ? place.nationalPhoneNumber : null),
        email: inferEmailFromWebsite(website),
        instagram: null,
        rating: typeof place.rating === "number" ? place.rating : null,
        review_count: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
        raw: place,
      });
    }
  }
  return records;
}

async function searchExa({
  apiKey,
  scan,
}: {
  apiKey: string;
  scan: ScanRecord;
}) {
  const records: ProspectSeed[] = [];
  for (const category of scan.categories.slice(0, 4)) {
    const response = await fetch(EXA_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: `${category} companies in ${scan.city} ${scan.country}`,
        type: "auto",
        numResults: 6,
        category: "company",
        contents: { text: true },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Exa error: ${detail.slice(0, 180)}`);
    }

    const payload = await response.json() as {
      results?: Array<Record<string, unknown>>;
    };

    for (const item of payload.results ?? []) {
      const website = normalizeUrl(typeof item.url === "string" ? item.url : null);
      const text = typeof item.text === "string" ? item.text : "";
      records.push({
        source: "exa",
        source_id: String(item.id ?? item.url ?? randomUUID()),
        name: typeof item.title === "string" ? item.title : website ?? "Unknown company",
        category,
        address: null,
        city: scan.city,
        country: scan.country,
        website,
        phone: null,
        email: inferEmailFromText(text) ?? inferEmailFromWebsite(website),
        instagram: inferInstagram(text),
        rating: null,
        review_count: null,
        raw: item,
      });
    }
  }
  return records;
}

async function ensureManualScan(admin: AdminClient, tenantId: string, city?: string, country?: string) {
  const safeCountry = /^[A-Za-z]{2}$/.test(country ?? "") ? String(country).toUpperCase() : "US";
  const { data: existing } = await admin
    .from("scans")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "done")
    .contains("sources", ["manual"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await admin
    .from("scans")
    .insert({
      tenant_id: tenantId,
      city: city?.trim() || "Manual list",
      country: safeCountry,
      radius_m: 0,
      categories: ["manual"],
      sources: ["manual"],
      status: "done",
      counts: { found: 0, unique: 0, enriched: 0, scored: 0, drafted: 0 },
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Could not create manual workspace scan");
  return created.id;
}

async function updateScanState(admin: AdminClient, scanId: string, updates: Record<string, unknown>) {
  const { error } = await admin.from("scans").update(updates).eq("id", scanId);
  if (error) throw new Error(error.message);
}

async function updateJobState(admin: AdminClient, jobId: string, updates: Record<string, unknown>) {
  const { error } = await admin.from("jobs").update(updates).eq("id", jobId);
  if (error) throw new Error(error.message);
}

function preferredLanguage(defaultMarketLang: string, answers: RawAnswers) {
  const answer = `${answers.market_lang ?? ""} ${answers["answer-7"] ?? ""}`.toLowerCase();
  if (answer.includes("spanish") || answer.includes("espanol") || answer.includes("español") || defaultMarketLang.startsWith("es")) return "es";
  return "en";
}

function firstSentence(value: string | undefined) {
  return compactWhitespace(value ?? "").split(/(?<=[.!?])\s+/)[0] ?? "";
}

function extractSignerName(value: string | undefined) {
  const normalized = compactWhitespace(value ?? "");
  if (!normalized) return "";
  const [head] = normalized.split(/[.,;:-]/);
  return head.length <= 50 ? head : "";
}

function dedupeProspectSeeds(records: ProspectSeed[]) {
  const groups = new Map<string, ProspectSeed>();
  for (const record of records) {
    const key = [
      normalizeSlug(record.name),
      normalizeSlug(record.website ?? ""),
      normalizeSlug(record.phone ?? ""),
    ].join("|");
    const current = groups.get(key);
    if (!current || prospectCompleteness(record) > prospectCompleteness(current)) groups.set(key, record);
  }
  return [...groups.values()];
}

function prospectCompleteness(record: ProspectSeed) {
  return [record.address, record.website, record.phone, record.email, record.rating, record.review_count]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .length;
}

function normalizeTokens(value: string | null | undefined) {
  return compactWhitespace(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".");
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = compactWhitespace(value ?? "");
  return normalized || null;
}

function normalizeUrl(value: string | null | undefined) {
  const normalized = normalizeOptional(value);
  if (!normalized) return null;
  return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
}

function inferEmailFromWebsite(website: string | null) {
  if (!website) return null;
  try {
    const hostname = new URL(website).hostname.replace(/^www\./, "");
    return `hello@${hostname}`;
  } catch {
    return null;
  }
}

function inferEmailFromText(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function inferInstagram(value: string) {
  const match = value.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return match?.[1] ? `@${match[1]}` : null;
}

function extractCity(address: string | null, fallbackCity: string) {
  if (!address) return fallbackCity;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] ?? fallbackCity : fallbackCity;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizePhone(value: string | null | undefined) {
  const phone = normalizeOptional(value);
  return phone ? phone.replace(/[^\d+]/g, "") : null;
}
