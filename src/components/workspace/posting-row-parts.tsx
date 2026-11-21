"use client";

// Pieces shared by the postings table (wide screens) and the posting cards (phones).
import { Bookmark } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { eligibility, majorFit, MAJOR_FIT_LABELS, remainingDays, type Application, type Posting } from "@/lib/domain";
import type { Major } from "@/lib/majors";
import { competitionRatio, stipendParts } from "@/lib/posting-format";

export type RowProps = {
  postings: Posting[];
  applications: Application[];
  favoriteIds: string[];
  compared: string[];
  now: Date;
  major: Major | null;
  onCompare: (id: string) => void;
  onOpen: (p: Posting) => void;
  onFavorite: (id: string) => void;
};

/** The deadline as a figure: orange only inside three days, so the eye finds what closes first. */
function DayMark({ tone, label }: { tone: "soon" | "plain" | "closed"; label: string }): React.ReactElement {
  return (
    <span className="day-mark" data-tone={tone}>
      {label}
    </span>
  );
}

/** Same wording as before: 마감, 확인 필요, 오늘 마감, D-n (orange within three days). */
export function DeadlineBadge({
  posting,
  applications,
  now,
}: {
  posting: Posting;
  applications: Application[];
  now: Date;
}) {
  if (eligibility(posting, applications, now).status === "closed") return <DayMark tone="closed" label="마감" />;
  const days = remainingDays(posting, now);
  if (days === null) return <DayMark tone="closed" label="확인 필요" />;
  if (days <= 0) return <DayMark tone="soon" label="오늘 마감" />;
  return <DayMark tone={days <= 3 ? "soon" : "plain"} label={`D-${days}`} />;
}

export function MajorFitBadge({ posting, major }: { posting: Posting; major: Major | null }) {
  const fit = majorFit(posting, major);
  if (fit === "none") return null;
  const variant = fit === "other" ? "neutral" : fit === "required" || fit === "preferred" ? "green" : "teal";
  return <Badge variant={variant} label={MAJOR_FIT_LABELS[fit]} />;
}

/**
 * The compare checkbox and bookmark sit above the row's stretched link (see .row-link in globals.css), so they keep
 * their own clicks.
 */
export function CompareBox({
  posting,
  checked,
  onCompare,
}: {
  posting: Posting;
  checked: boolean;
  onCompare: RowProps["onCompare"];
}) {
  return (
    <span className="row-control">
      <CheckboxInput
        label={`${posting.company} ${posting.title} 비교 선택`}
        isLabelHidden
        value={checked}
        onChange={() => onCompare(posting.id)}
      />
    </span>
  );
}

export function BookmarkButton({
  posting,
  saved,
  onFavorite,
}: {
  posting: Posting;
  saved: boolean;
  onFavorite: RowProps["onFavorite"];
}) {
  return (
    <span className="row-control">
      <IconButton
        variant="ghost"
        size="sm"
        label={`${posting.company} ${posting.title} ${saved ? "관심 해제" : "관심 저장"}`}
        icon={<Bookmark size={18} fill={saved ? "currentColor" : "none"} />}
        onClick={() => onFavorite(posting.id)}
      />
    </span>
  );
}

/** "월 **224** 만원" with the amount large; the source text, dimmed, when the amount or unit is unknown. */
export function StipendAmount({ posting, justify = "end" }: { posting: Posting; justify?: "start" | "end" }) {
  const parts = stipendParts(posting);
  if (!parts)
    return (
      <Text type="supporting" maxLines={1}>
        {posting.stipend.raw || "미기재"}
      </Text>
    );
  return (
    <HStack gap={0.5} align="end" justify={justify}>
      <Text type="supporting">{parts.prefix}</Text>
      <Text weight="bold" size="lg" hasTabularNumbers>
        {parts.amount}
      </Text>
      <Text type="supporting">{parts.suffix}</Text>
    </HStack>
  );
}

/** "3.5 : 1" over "지원 7 · 모집 2". */
export function Competition({ posting, align = "end" }: { posting: Posting; align?: "start" | "end" }) {
  return (
    <VStack gap={0.5} align={align}>
      <Text weight="semibold" hasTabularNumbers>
        {competitionRatio(posting)}
      </Text>
      <Text type="supporting" hasTabularNumbers>
        지원 {posting.applicants ?? "-"} · 모집 {posting.headcount ?? "-"}
      </Text>
    </VStack>
  );
}
