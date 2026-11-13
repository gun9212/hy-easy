"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import type { SourceReason } from "@demo/lib/postings-source";

const MESSAGES: Record<Exclude<SourceReason, "live">, { title: string; description: string; canLogin: boolean }> = {
  "not-configured": {
    title: "Supabase 설정이 없어 가상 데이터를 보여줍니다",
    description: "메인 앱의 .env.local에 Supabase URL과 publishable key를 넣으면 실제 공고를 읽습니다.",
    canLogin: false,
  },
  "signed-out": {
    title: "가상 데이터를 보여주고 있어요",
    description:
      "같은 주소의 메인 앱(포트 3000)에 한양대 Google 계정으로 로그인하면, 로그인 세션을 그대로 써서 실제 공고가 나옵니다.",
    canLogin: true,
  },
  "not-school": {
    title: "학교 계정이 아니라 가상 데이터를 보여줍니다",
    description: "실제 공고는 인증된 한양대 Google 계정으로만 볼 수 있습니다.",
    canLogin: true,
  },
  empty: {
    title: "읽어 온 공고가 없어 가상 데이터를 보여줍니다",
    description: "수집기가 아직 공고를 저장하지 않았거나 이 계정에 공개된 공고가 없습니다.",
    canLogin: false,
  },
  error: {
    title: "공고를 읽지 못해 가상 데이터를 보여줍니다",
    description: "잠시 후 새로고침해 보세요. 자세한 오류는 데모 서버 로그에 있습니다.",
    canLogin: false,
  },
};

/** Says why the page shows the fictional sample instead of real postings; renders nothing for real data. */
type BannerProps = { reason: SourceReason; mainAppLogin: string };
export function SourceBanner({ reason, mainAppLogin }: BannerProps): React.ReactElement | null {
  if (reason === "live") return null;
  const message = MESSAGES[reason];
  return (
    <Banner
      status="info"
      title={message.title}
      description={message.description}
      collapsible={false}
      endContent={
        message.canLogin ? (
          <Button variant="secondary" size="sm" label="메인 앱에서 로그인" href={mainAppLogin} />
        ) : undefined
      }
    />
  );
}
