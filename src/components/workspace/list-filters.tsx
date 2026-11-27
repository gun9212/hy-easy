"use client";

// Search, filter selects, the major checkboxes and the sort control above the postings.
import { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MAX_SEARCH_QUERY_CHARS, ROLES, type Filters, type Posting } from "@/lib/domain";
import { durationOptions, regionOptions, stipendOptions, termOptions, type Option } from "@/lib/filter-options";
import { SEOUL_COLLEGES, isMajor, type Major } from "@/lib/majors";

/** Counts behind the major options: without the major restriction, and with "내 전공 관련만". */
export type MajorCounts = { all: number; related: number };

type Props = {
  postings: Posting[];
  filters: Filters;
  updateFilters: (patch: Filters) => void;
  major: Major | null;
  onMajor: (major: Major | null) => void;
  total: number;
  majorCounts: MajorCounts | null;
};

const SORTS = [
  ["deadline", "마감순"],
  ["stipend", "실습지원비순"],
  ["latest", "최신순"],
] as const;
const MAJOR_OPTIONS = SEOUL_COLLEGES.map(c => ({
  type: "section" as const,
  title: c.college,
  options: c.majors.map(m => ({ value: m, label: m })),
}));

function toOptions(options: readonly Option[]): { value: string; label: string }[] {
  return options.map(([value, label]) => ({ value, label }));
}

function Filter(props: { label: string; value: string; options: readonly Option[]; onChange: (v: string) => void }) {
  return (
    <Selector
      label={props.label}
      isLabelHidden
      placeholder={`${props.label} 전체`}
      options={toOptions(props.options)}
      value={props.value || null}
      onChange={v => props.onChange(v ?? "")}
      hasClear
    />
  );
}

function Checks({ filters, updateFilters, majorCounts }: Pick<Props, "filters" | "updateFilters" | "majorCounts">) {
  if (!majorCounts) return null;
  return (
    <HStack gap={3} align="center" wrap="wrap">
      <CheckboxInput
        label={`내 전공 관련만 (${majorCounts.related})`}
        value={filters.mine === "true"}
        onChange={checked => updateFilters({ mine: checked ? "true" : "" })}
      />
      <CheckboxInput
        label="다른 전공 대상도 보기"
        value={filters.others === "true"}
        onChange={checked => updateFilters({ others: checked ? "true" : "" })}
      />
    </HStack>
  );
}

/** Filters behind "필터 더보기": how many are set, so the button can say so. */
function extraCount(filters: Filters): number {
  return (
    [filters.term, filters.location, filters.duration, filters.stipend].filter(Boolean).length +
    (filters.mine === "true" ? 1 : 0) +
    (filters.others === "true" ? 1 : 0)
  );
}

/** The demo's single row (search, major, role, sort, count); the rest opens under "필터 더보기". */
export function ListFilters(props: Props): React.ReactElement {
  const { postings, filters, updateFilters, majorCounts } = props;
  const options = useMemo(
    () => ({
      terms: termOptions(postings),
      regions: regionOptions(postings),
      durations: durationOptions(postings),
      stipends: stipendOptions(postings),
    }),
    [postings],
  );
  const active = extraCount(filters);
  const [isOpen, setIsOpen] = useState(active > 0);
  const hidden = majorCounts ? majorCounts.all - props.total : 0;
  return (
    <VStack gap={3}>
      <HStack gap={2} align="center" wrap="wrap">
        <TextInput
          type="search"
          htmlName="q"
          autoComplete="off"
          ref={el => {
            if (el) el.maxLength = MAX_SEARCH_QUERY_CHARS;
          }}
          label="회사, 공고명, 업무로 검색"
          isLabelHidden
          placeholder="회사, 공고명, 업무로 검색"
          value={(filters.q ?? "").slice(0, MAX_SEARCH_QUERY_CHARS)}
          onChange={q => updateFilters({ q: q.slice(0, MAX_SEARCH_QUERY_CHARS) })}
          hasClear
          width={280}
        />
        <Selector
          label="내 전공"
          isLabelHidden
          placeholder="내 전공 선택"
          options={MAJOR_OPTIONS}
          value={props.major ?? null}
          onChange={v => props.onMajor(isMajor(v) ? v : null)}
          hasSearch
          searchPlaceholder="전공 검색"
          hasClear
        />
        <Filter
          label="직군"
          value={filters.role ?? ""}
          options={ROLES.map(r => [r, r] as const)}
          onChange={role => updateFilters({ role })}
        />
        <SegmentedControl
          label="공고 정렬"
          value={filters.sort || "deadline"}
          onChange={sort => updateFilters({ sort })}
        >
          {SORTS.map(([value, label]) => (
            <SegmentedControlItem key={value} value={value} label={label} />
          ))}
        </SegmentedControl>
        <Button
          variant="ghost"
          label={active ? `필터 더보기 (${active})` : "필터 더보기"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(open => !open)}
        />
        <Text type="supporting">
          <b>{props.total}</b>개 공고{majorCounts && hidden > 0 ? ` · 전체 ${majorCounts.all}개` : ""}
        </Text>
      </HStack>
      {isOpen && (
        <HStack gap={2} align="center" wrap="wrap">
          <Filter
            label="학기"
            value={filters.term ?? ""}
            options={options.terms}
            onChange={term => updateFilters({ term })}
          />
          <Filter
            label="지역"
            value={filters.location ?? ""}
            options={options.regions}
            onChange={location => updateFilters({ location })}
          />
          <Filter
            label="실습 기간"
            value={filters.duration ?? ""}
            options={options.durations}
            onChange={duration => updateFilters({ duration })}
          />
          <Filter
            label="실습지원비"
            value={filters.stipend ?? ""}
            options={options.stipends}
            onChange={stipend => updateFilters({ stipend })}
          />
          <Checks filters={filters} updateFilters={updateFilters} majorCounts={majorCounts} />
        </HStack>
      )}
    </VStack>
  );
}
