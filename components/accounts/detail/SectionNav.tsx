"use client";

import { useEffect, useState } from "react";
import { PillLink } from "@/components/charts/primitives";
import { useDict } from "@/lib/i18n/I18nProvider";

/**
 * Sticky anchor nav for the dossier.
 *
 * Deliberately anchors rather than tabs: the whole premise of this page is that
 * everything is visible, and tabs would hide half of it behind a click while
 * forcing a client boundary around content that wants to be server-rendered.
 * Anchors are also deep-linkable and RTL-safe for free.
 */
export function SectionNav({ sections }: { sections: string[] }) {
  const dict = useDict();
  const nav = dict.accounts.detail.nav as Record<string, string>;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = sections
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Top-weighted band: a section counts as "current" once its heading is
      // near the top of the viewport, not when it merely peeks in from below.
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 }
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-[57px] z-10 -mx-1 flex gap-1.5 overflow-x-auto rounded-xl bg-background/85 px-1 py-2 backdrop-blur">
      {sections.map((id) => (
        <PillLink key={id} href={`#${id}`} active={active === id}>
          {nav[id] ?? id}
        </PillLink>
      ))}
    </nav>
  );
}
