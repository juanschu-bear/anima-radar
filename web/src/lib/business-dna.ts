export type RawAnswers = Record<string, string>;

export type BusinessIcp = {
  what_we_sell: string;
  differentiators: string[];
  proof: string[];
  languages: string[];
  ideal_customer: {
    types: string[];
    geo: string[];
    buying_signals: string[];
    disqualifiers: string[];
  };
  search_plan: {
    suggested_cities: string[];
    category_keywords: string[];
    sources: string[];
  };
};

export function deriveBusinessIcp(answers: RawAnswers, marketLang = "en") : BusinessIcp {
  const whatWeSell = firstSentence(answers["answer-1"]) || "";
  const bestCustomers = splitIdeas(answers["answer-2"]);
  const neverFit = splitIdeas(answers["answer-3"]);
  const growthTargets = splitIdeas(answers["answer-4"]);
  const differentiators = splitIdeas(answers["answer-5"]);
  const proof = splitIdeas(answers["answer-6"]);
  const signerAndLanguage = splitIdeas(answers["answer-7"]);
  const nextStep = splitIdeas(answers["answer-8"]);

  const categoryKeywords = uniqueList([
    ...bestCustomers,
    ...extractCategoryHints(whatWeSell),
    ...extractCategoryHints(bestCustomers.join(", ")),
  ]).slice(0, 8);

  const buyingSignals = uniqueList([
    ...proof,
    ...nextStep,
    ...extractSignalHints(answers["answer-1"]),
    ...extractSignalHints(answers["answer-2"]),
  ]).slice(0, 8);

  const geo = uniqueList(growthTargets.flatMap(extractGeographies)).slice(0, 8);
  const languages = uniqueList([
    ...detectLanguages(marketLang),
    ...detectLanguages(answers["answer-7"]),
    ...signerAndLanguage.filter((item) => /english|spanish|español|espanol|german|deutsch|french|français|italian|italiano|russian|рус/i.test(item)),
  ]);

  return {
    what_we_sell: whatWeSell,
    differentiators: differentiators.slice(0, 6),
    proof: proof.slice(0, 6),
    languages,
    ideal_customer: {
      types: categoryKeywords,
      geo,
      buying_signals: buyingSignals,
      disqualifiers: neverFit.slice(0, 8),
    },
    search_plan: {
      suggested_cities: geo,
      category_keywords: categoryKeywords,
      sources: deriveSourcesForPlan({ geo, categoryKeywords }),
    },
  };
}

function deriveSourcesForPlan({
  geo,
  categoryKeywords,
}: {
  geo: string[];
  categoryKeywords: string[];
}) {
  const combined = `${geo.join(" ")} ${categoryKeywords.join(" ")}`.toLowerCase();
  const sources = ["google_places"];
  if (categoryKeywords.some((value) => /\b(agency|agencies|coach|coaches|consult|event|planner|saas|software|studio|recruit|headhunt)\b/i.test(value))) {
    sources.push("exa");
  }
  if (/\b(russia|moscow|almaty|kazakhstan|minsk|belarus|ru|kz|by)\b/i.test(combined)) {
    sources.push("2gis");
  }
  return uniqueList(sources);
}

function splitIdeas(value: string | undefined) {
  return compactWhitespace(value ?? "")
    .split(/\n|[•;]|(?:\.\s+)|(?:,\s+(?=[A-ZÁÉÍÓÚÜÑ]))/g)
    .map((item) => compactWhitespace(item))
    .filter((item) => item.length >= 3)
    .slice(0, 12);
}

function extractGeographies(value: string) {
  return value
    .split(/[;,/]| and | y | then | luego /i)
    .map((item) => compactWhitespace(item.replace(/\([^)]*\)/g, "")))
    .filter((item) => item.length >= 2);
}

function extractCategoryHints(value: string) {
  return value
    .split(/[;,/]| and | y /i)
    .map((item) => compactWhitespace(item))
    .filter((item) => item.length >= 3)
    .map(stripLeadIn)
    .filter((item) => !/^(we|our|the|una|uno|unos|unas|el|la|los|las)\b/i.test(item))
    .slice(0, 8);
}

function extractSignalHints(value: string | undefined) {
  return compactWhitespace(value ?? "")
    .split(/[.;]/)
    .map((item) => compactWhitespace(item))
    .filter((item) => item.length >= 8)
    .slice(0, 6);
}

function detectLanguages(value: string) {
  const normalized = value.toLowerCase();
  const languages = [
    normalized.includes("spanish") || normalized.includes("español") || normalized.includes("espanol") ? "Spanish" : null,
    normalized.includes("english") || normalized.includes("inglés") || normalized.includes("ingles") ? "English" : null,
    normalized.includes("german") || normalized.includes("deutsch") || normalized.includes("alemán") || normalized.includes("aleman") ? "German" : null,
    normalized.includes("french") || normalized.includes("francés") || normalized.includes("frances") ? "French" : null,
    normalized.includes("italian") || normalized.includes("italiano") ? "Italian" : null,
    normalized.includes("russian") || normalized.includes("ruso") || normalized.includes("рус") ? "Russian" : null,
  ];
  return languages.filter((item): item is string => Boolean(item));
}

function uniqueList(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => compactWhitespace(value ?? "")).filter(Boolean))];
}

function firstSentence(value: string | undefined) {
  return compactWhitespace(value ?? "").split(/(?<=[.!?])\s+/)[0] ?? "";
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadIn(value: string) {
  return value.replace(/^(who|that|which|companies?|businesses?|teams?|clients?|for|de|para)\s+/i, "");
}
