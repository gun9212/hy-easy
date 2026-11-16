"use client";

import { useId, useMemo, useState } from "react";
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

const MAX_OPTIONS = 80;

/** A posting select with a search field above it: the list holds 190+ postings, too many to scroll through. */
export function PostingPicker({ label, placeholder, postings, value, onChange, required }: Props) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const found = useMemo(() => searchPostings(postings, query), [postings, query]);
  const shown = found.slice(0, MAX_OPTIONS);
  const selected = postings.find(p => p.id === value);
  const options = selected && !shown.includes(selected) ? [selected, ...shown] : shown;
  const searching = query.trim().length > 0;
  return (
    <div className="form-field posting-picker">
      <label htmlFor={searchId}>{label}</label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="회사나 공고명으로 찾기"
        autoComplete="off"
      />
      <select aria-label={`${label} 선택`} required={required} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{searching ? `검색 결과 ${found.length}개 · 선택하세요` : placeholder}</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>
            {postingOptionLabel(p)}
          </option>
        ))}
      </select>
      {found.length > MAX_OPTIONS && (
        <small className="muted">
          {found.length}개 중 {MAX_OPTIONS}개만 보여요. 검색어를 더 입력해 주세요.
        </small>
      )}
    </div>
  );
}
