"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import type { SourceReason } from "@demo/lib/postings-source";

type Action = { label: string; path: string };
type Message = { title: string; description: string; action: Action | null };

const LOGIN: Action = { label: "메인 앱에서 로그인", path: "/login" };

const MESSAGES: Record<Exclude<SourceReason, "live">, Message> = {
  "not-configured": {
    title: "Supabase 설정이 없어 가상 데이터를 보여줍니다",
    description: "메인 앱의 .env.local에 Supabase URL과 publishable key를 넣으면 실제 공고를 읽습니다.",
    action: null,
  },
  "signed-out": {
    title: "가상 데이터를 보여주고 있어요",
    description:
      "같은 주소의 메인 앱(포트 3000)에 한양대 Google 계정으로 로그인하면, 로그인 세션을 그대로 써서 실제 공고가 나옵니다.",
    action: LOGIN,
  },
  expired: {
    title: "로그인이 만료돼 가상 데이터를 보여줍니다",
    description:
      "데모는 로그인을 갱신하지 못합니다. 메인 앱을 한 번 열면 갱신되니, 그다음 이 페이지를 새로고침해 주세요.",
    action: { label: "메인 앱 열어 갱신", path: "/postings" },
  },
  "not-school": {
    title: "학교 계정이 아니라 가상 데이터를 보여줍니다",
    description: "실제 공고는 인증된 한양대 Google 계정으로만 볼 수 있습니다.",
    action: LOGIN,
  },
  empty: {
    title: "읽어 온 공고가 없어 가상 데이터를 보여줍니다",
    description: "수집기가 아직 공고를 저장하지 않았거나 이 계정에 공개된 공고가 없습니다.",
    action: null,
  },
  error: {
    title: "공고를 읽지 못해 가상 데이터를 보여줍니다",
    description: "잠시 후 새로고침해 보세요. 자세한 오류는 데모 서버 로그에 있습니다.",
    action: null,
  },
};

type Props = { reason: SourceReason; mainAppBase: string };

/** Says why the page shows the fictional sample instead of real postings; renders nothing for real data. */
export function SourceBanner({ reason, mainAppBase }: Props): React.ReactElement | null {
  if (reason === "live") return null;
  const { title, description, action } = MESSAGES[reason];
  return (
    <Banner
      status={reason === "expired" ? "warning" : "info"}
      title={title}
      description={description}
      collapsible={false}
      endContent={
        action ? (
          <Button variant="secondary" size="sm" label={action.label} href={new URL(action.path, mainAppBase).href} />
        ) : undefined
      }
    />
  );
}
