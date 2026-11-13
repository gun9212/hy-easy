"use client";

// Search, filter selects, the major and closed checkboxes and the sort control above the postings.
import { useMemo } from "react";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ROLES, type Filters, type Posting } from "@/lib/domain";
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
  ["stipend", "지원비순"],
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
      size="sm"
    />
  );
}

function Checks({ filters, updateFilters, majorCounts }: Pick<Props, "filters" | "updateFilters" | "majorCounts">) {
  return (
    <HStack gap={3} align="center" wrap="wrap">
      {majorCounts && (
        <>
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
        </>
      )}
      <CheckboxInput
        label="마감 포함"
        value={filters.closed === "true"}
        onChange={checked => updateFilters({ closed: String(checked) })}
      />
    </HStack>
  );
}

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
  const hidden = majorCounts ? majorCounts.all - props.total : 0;
  return (
    <VStack gap={3}>
      <HStack gap={2} align="center" wrap="wrap">
        <TextInput
          type="search"
          label="기업명, 직무, 기술 검색"
          isLabelHidden
          placeholder="기업명, 직무 또는 기술을 검색해 보세요"
          value={filters.q ?? ""}
          onChange={q => updateFilters({ q })}
          hasClear
          width={320}
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
          size="sm"
        />
        <Filter
          label="직군"
          value={filters.role ?? ""}
          options={ROLES.map(r => [r, r] as const)}
          onChange={role => updateFilters({ role })}
        />
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
          label="지원금"
          value={filters.stipend ?? ""}
          options={options.stipends}
          onChange={stipend => updateFilters({ stipend })}
        />
      </HStack>
      <HStack gap={3} align="center" justify="between" wrap="wrap">
        <HStack gap={3} align="center" wrap="wrap">
          <Text type="supporting">
            총 <b>{props.total}</b>개의 공고{majorCounts && hidden > 0 ? ` · 전체 ${majorCounts.all}개` : ""}
          </Text>
          <Checks filters={filters} updateFilters={updateFilters} majorCounts={majorCounts} />
        </HStack>
        <SegmentedControl
          label="공고 정렬"
          size="sm"
          value={filters.sort || "deadline"}
          onChange={sort => updateFilters({ sort })}
        >
          {SORTS.map(([value, label]) => (
            <SegmentedControlItem key={value} value={value} label={label} />
          ))}
        </SegmentedControl>
      </HStack>
    </VStack>
  );
}
