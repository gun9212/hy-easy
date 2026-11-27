"use client";

import { useMemo } from "react";
import { Typeahead } from "@astryxdesign/core/Typeahead";
import type { Posting } from "@/lib/domain";
import { postingOptionLabel, searchPostings } from "@/lib/posting-picker";

type Props = {
  label: string;
  placeholder: string;
  postings: readonly Posting[];
  value: string;
  onChange: (postingId: string) => void;
  required?: boolean;
};

type Item = { id: string; label: string };

const MAX_OPTIONS = 20;

/**
 * A posting field that is searched by typing: the list holds 190+ postings, too many to scroll through. Focusing it
 * shows the first postings; typing narrows them by company, title or team (every word must match).
 */
export function PostingPicker({ label, placeholder, postings, value, onChange, required }: Props) {
  const items = useMemo(() => postings.map(p => ({ id: p.id, label: postingOptionLabel(p) })), [postings]);
  const searchSource = useMemo(() => {
    const byId = new Map(items.map(item => [item.id, item]));
    const toItems = (found: readonly Posting[]) => found.flatMap(p => byId.get(p.id) ?? []);
    return {
      search: (query: string) => toItems(searchPostings(postings, query)),
      bootstrap: () => items,
    };
  }, [items, postings]);
  const selected: Item | null = items.find(item => item.id === value) ?? null;
  return (
    <Typeahead<Item>
      label={label}
      placeholder={placeholder}
      searchSource={searchSource}
      value={selected}
      onChange={item => onChange(item?.id ?? "")}
      hasEntriesOnFocus
      maxMenuItems={MAX_OPTIONS}
      debounceMs={0}
      emptySearchText="맞는 공고가 없어요. 회사나 공고명으로 찾아 보세요."
      isRequired={required}
      width="100%"
    />
  );
}
