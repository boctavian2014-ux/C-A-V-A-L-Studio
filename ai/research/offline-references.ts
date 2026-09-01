import type { ProductCategory, ProductGoal, ResearchSourceHit } from "./types";

/** Curated public references — takeaways are original, not page copy. */
const PACKS: Array<{
  categories: ProductCategory[];
  goals?: ProductGoal[];
  hit: ResearchSourceHit;
}> = [
  {
    categories: ["landing", "website"],
    hit: {
      url: "https://web.dev/learn/design/",
      title: "web.dev Learn Design",
      kind: "ux-pattern",
      note: "Put the primary conversion action on the first screen; decoration is secondary.",
    },
  },
  {
    categories: ["landing", "website", "web-app"],
    goals: ["booking"],
    hit: {
      url: "https://www.w3.org/WAI/WCAG22/quickref/",
      title: "WCAG 2.2 Quick Reference",
      kind: "ux-pattern",
      note: "Booking controls need labels, focus, and errors that work on a phone.",
    },
  },
  {
    categories: ["marketplace", "web-app"],
    hit: {
      url: "https://web.dev/patterns/",
      title: "web.dev Patterns",
      kind: "template",
      note: "Catalog and checkout stay usable when each step has one job.",
    },
  },
  {
    categories: ["mobile-app", "marketplace"],
    hit: {
      url: "https://developer.apple.com/design/human-interface-guidelines/",
      title: "Apple Human Interface Guidelines",
      kind: "ux-pattern",
      note: "One thumb-reach primary action beats a dense module map.",
    },
  },
  {
    categories: ["dashboard", "web-app"],
    hit: {
      url: "https://www.nngroup.com/articles/dashboard-design/",
      title: "NN/g dashboard design notes",
      kind: "trend",
      note: "Show the next decision, not every metric at once.",
    },
  },
  {
    categories: ["landing", "website", "web-app", "marketplace"],
    hit: {
      url: "https://web.dev/articles/fast",
      title: "web.dev Fast load",
      kind: "trend",
      note: "First paint should stay light — skip stacked motion kits.",
    },
  },
];

export function offlineReferenceHits(
  category: ProductCategory,
  goal: ProductGoal | null
): ResearchSourceHit[] {
  return PACKS.filter((pack) => {
    if (!pack.categories.includes(category)) return false;
    if (pack.goals && goal && !pack.goals.includes(goal)) return false;
    return true;
  }).map((pack) => ({ ...pack.hit }));
}

export function userUrlHits(urls: string[]): ResearchSourceHit[] {
  return urls.map((url) => ({
    url,
    title: "User-supplied reference",
    kind: "user-url" as const,
    note: "Use structure only. Do not copy layout, copy, or assets.",
  }));
}
