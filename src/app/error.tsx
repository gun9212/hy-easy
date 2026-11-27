"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>정보를 불러오지 못했어요.</h1>
      <p>연결 상태를 확인하고 다시 시도해 주세요.</p>
      <button className="primary-button" onClick={reset}>
        다시 시도
      </button>
      {/* "/" sends a signed-in student to the postings and anyone else to the login page. */}
      <Link href="/">처음으로</Link>
    </main>
  );
}
