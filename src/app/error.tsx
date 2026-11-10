"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="error-page"><span className="eyebrow">HY-EASY</span><h1>정보를 불러오지 못했어요.</h1><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button className="primary-button" onClick={reset}>다시 시도</button><a href="/login">로그인으로 돌아가기</a></main>;
}
