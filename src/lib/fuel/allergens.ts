/** Product labels use their own allergen vocabulary, independently of the recipe catalogue. */
export function normalizedFoodText(value: string): string {
  return value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}
const groups: Record<string, RegExp> = {
  milk: /mlek|mlecz|nabial|laktoz|lactos|milk|dairy/,
  eggs: /jaj|\beggs?\b/,
  peanuts: /arachid|orzech.{0,8}ziemn|peanut/,
  nuts: /orzech|migdal|nerkow|pistac|hazelnut|walnut|almond|cashew|pistachio|\bnuts?\b/,
  gluten: /gluten|celiak|pszen|jeczm|zytni|zyto|wheat|barley|rye/,
  oats: /owies|owsian|\boats?\b/,
  soy: /soj|soy/,
  fish: /ryb|fish|tuncz|losos|salmon|tuna/,
  crustaceans: /skorupiak|krewet|krab|homar|crustacean|shrimp|prawn|lobster|\bcrab/,
  molluscs: /mieczak|malz|ostryg|kalm|osmiornic|mollusc|mollusk|squid|octopus|mussel|oyster/,
  sesame: /sezam|sesame|tahin/,
  celery: /seler|celery/,
  mustard: /gorczyc|musztard|mustard/,
  lupin: /lubin|lupin/,
  sulphites: /siarczyn|sulphit|sulfit|sulphur.dioxide|sulfur.dioxide/,
};
function keys(text: string): string[] {
  const normalized = normalizedFoodText(text);
  return Object.entries(groups)
    .filter(([, re]) => re.test(normalized))
    .map(([key]) => key);
}
export function productRestrictionCheck(input: {
  name: string;
  ingredientsText?: string | null;
  allergens?: string[];
  restrictions: string[];
  diet: "all" | "vegetarian" | "vegan";
}): "conflict" | "unverified" | "no-detected-conflict" {
  const text = normalizedFoodText(
    [input.name, input.ingredientsText, ...(input.allergens ?? [])].filter(Boolean).join(" "),
  );
  const detected = new Set(keys(text));
  if (
    input.restrictions.some((raw) => {
      const term = normalizedFoodText(raw).trim();
      return term && (keys(term).some((key) => detected.has(key)) || text.includes(term));
    })
  )
    return "conflict";
  const meat =
    /chicken|kurcz|turkey|indyk|beef|wolow|pork|wieprz|bacon|bekon|szynk|ham\b|gelatin|zelatyn/;
  if (
    input.diet !== "all" &&
    (meat.test(text) ||
      detected.has("fish") ||
      detected.has("crustaceans") ||
      detected.has("molluscs"))
  )
    return "conflict";
  if (
    input.diet === "vegan" &&
    (detected.has("milk") || detected.has("eggs") || /honey|miod/.test(text))
  )
    return "conflict";
  if (input.restrictions.length || input.diet !== "all") {
    // A partial tag list or a product name cannot establish absence of an ingredient.
    if (!input.ingredientsText?.trim() || (input.allergens ?? []).some((tag) => !keys(tag).length))
      return "unverified";
    if (input.restrictions.some((term) => !keys(term).length)) return "unverified";
  }
  return "no-detected-conflict";
}
