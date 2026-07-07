// Hand-curated cold-start account suggestions, keyed by niche. Unlike
// suggestedAccounts() (cross-user aggregation over what OTHER ReelSpy users
// track — worthless until the platform has real breadth), this list is a
// fixed set of well-known, real Instagram handles picked by hand so "Discover
// accounts" has something to offer on day one, before any cross-user data
// exists.
//
// Trade-off, stated plainly: this is a best-effort list, not a live search —
// Instagram has no public "search accounts by keyword" API for third-party
// apps, so there is no way to verify these live at request time without
// spending Meta quota on every keystroke. A wrong or since-renamed handle
// isn't dangerous: adding it goes through the same insert path as any other
// tracked account, and the normal snapshot-refresh cron will simply mark it
// as unreachable (last_status) rather than corrupt anything. Expand/replace
// entries here as they go stale.
//
// Keys are free text (matched via the same slugify + word-overlap logic as
// resolveNicheSlug) — they don't need to line up with any specific user's
// account_groups naming.
export const SEED_ACCOUNTS_BY_NICHE: Record<string, string[]> = {
  "software engineering": ["github", "freecodecamp", "techcrunch", "theverge", "mkbhd", "wired"],
  "ai": ["openai", "nvidia", "midjourney", "github", "techcrunch"],
  "artificial intelligence": ["openai", "nvidia", "midjourney", "github", "techcrunch"],
  "tech": ["theverge", "techcrunch", "wired", "mkbhd", "github"],
  "social media": ["garyvee", "hubspot", "socialmediaexaminer", "neilpatel", "hootsuite"],
  "marketing": ["garyvee", "hubspot", "neilpatel", "forbes", "entrepreneur"],
  "memes": ["9gag", "fuckjerry", "kalesalad", "betches"],
  "comedy": ["9gag", "fuckjerry", "kalesalad", "betches"],
  "fitness": ["hodgetwins", "kayla_itsines", "gymshark", "jeff_nippard"],
  "beauty": ["hudabeauty", "jamescharles", "nyxcosmetics"],
  "fashion": ["zara", "hm", "voguemagazine"],
  "food": ["gordongram", "bonappetitmag", "foodnetwork", "tasty"],
  "cooking": ["gordongram", "bonappetitmag", "foodnetwork", "tasty"],
  "travel": ["natgeotravel", "lonelyplanet", "expedia"],
  "business": ["garyvee", "entrepreneur", "forbes"],
  "entrepreneurship": ["garyvee", "entrepreneur", "forbes"],
  "finance": ["forbes", "bloomberg", "cnbc", "grahamstephan"],
  "personal finance": ["grahamstephan", "forbes", "cnbc"],
  "real estate": ["zillow", "realtor", "grahamstephan"],
  "gaming": ["ign", "xbox", "playstation"],
  "motivation": ["garyvee", "tonyrobbins", "jayshetty"],
  "self improvement": ["garyvee", "tonyrobbins", "jayshetty"],
  "parenting": ["parents"],
  "pets": ["natgeo", "animalplanet"],
  "photography": ["natgeo", "adobe", "behance"],
  "art": ["adobe", "behance", "natgeo"],
  "design": ["adobe", "behance"],
};

// Used when a niche has no match above (or no niche is set at all) — big,
// recognizable accounts across categories so "Discover accounts" never comes
// back completely empty.
export const SEED_ACCOUNTS_FALLBACK: string[] = [
  "natgeo",
  "nasa",
  "forbes",
  "nike",
  "garyvee",
  "techcrunch",
];
