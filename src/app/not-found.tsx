import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <p className="error-code">404</p>
      <h1>찾을 수 없는 페이지예요.</h1>
      <Link className="primary-button" href="/">
        처음으로
      </Link>
    </main>
  );
}
