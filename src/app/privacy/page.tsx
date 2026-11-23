import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "개인정보처리방침 · HY-Easy" };

const EFFECTIVE_DATE = "2026년 11월 23일";
const CONTACT_EMAIL = "gun9212@gmail.com";

const COLLECTED: [string, string, string][] = [
  [
    "Google 계정 정보",
    "@hanyang.ac.kr 이메일 주소, 계정 식별자, Google이 전달하는 이름과 프로필 사진 주소",
    "학교 계정 확인, 로그인 유지",
  ],
  ["전공", "직접 고른 서울캠퍼스 주전공 1개 (선택 항목)", '공고별 전공 관련도 표시와 "내 전공 관련만" 보기'],
  ["관심 공고", "저장한 공고와 저장 시각", "관심 공고 목록 제공"],
  ["지원 기록", "직접 입력한 공고별 지원 상태와 기록 시각, 상태 변경 이력", "지원 플래너와 다음 지원 일정 계산"],
  [
    "피드백",
    "직접 적은 피드백 내용과 보낸 화면 주소. 계정·이메일과 연결하지 않고 익명으로 저장",
    "서비스 개선 (운영자만 열람)",
  ],
  ["접속 정보", "로그인 세션 쿠키, 화면 테마 쿠키", "로그인 상태 유지, 고른 테마 기억"],
];

const PROCESSORS: [string, string, string][] = [
  ["Supabase", "로그인 처리, 데이터 저장 (서울 리전)", "대한민국"],
  ["Google Cloud", "데이터 백업 보관 (서울 리전)", "대한민국"],
  ["Vercel", "웹 서비스 호스팅 (요청이 서버를 거쳐 처리됨)", "미국 등"],
  ["Google", "Google 계정 로그인", "미국 등"],
];

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="policy-table-wrap">
      <table className="policy-table">
        <thead>
          <tr>
            {head.map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <header className="login-header">
        <Link href="/" className="brand">
          <Image
            className="brand-symbol"
            src="/brand/hy-easy-mark.svg"
            alt=""
            width={34}
            height={34}
            unoptimized
            priority
          />
          <span className="brand-name">HY-Easy</span>
        </Link>
      </header>
      <article className="policy-body">
        <h1>개인정보처리방침</h1>
        <p className="policy-lead">
          HY-Easy는 한양대학교 학생이 현장실습 공고를 비교하고 지원 일정을 관리하도록 돕는 비공식 서비스입니다. 서비스에
          꼭 필요한 정보만 처리하며, 광고나 마케팅에 쓰거나 다른 곳에 판매하지 않습니다.
        </p>
        <p className="policy-date">시행일 {EFFECTIVE_DATE}</p>

        <section>
          <h2>1. 처리하는 개인정보와 목적</h2>
          <Table head={["항목", "내용", "목적"]} rows={COLLECTED} />
          <p>
            현장실습 공고 정보는 운영자가 한양대 학생 계정으로 HY-WEP에 로그인해 확인한 기업 공고를 모은 것으로,
            HY-WEP과 마찬가지로 인증된 한양대 학생만 볼 수 있습니다. 일부 공고 원문에는 기업이 적어 둔 담당자 연락처가
            들어 있을 수 있으며, 원문 그대로 보여 줄 뿐 따로 모으거나 다른 용도로 쓰지 않습니다. 공고의 직군 분류에는 AI
            모델(Anthropic)을 쓰지만, 이때 보내는 것은 공고 내용뿐이며 이용자 정보(전공 포함)는 보내지 않습니다. 전공
            관련도는 미리 분류된 공고 정보와 이용자가 고른 전공을 화면에서 비교해 보여줍니다.
          </p>
          <p>
            @hanyang.ac.kr 계정이 아니어서 로그인이 거절된 경우에도, Google 로그인 과정에서 그 계정의 이메일 주소와 계정
            식별자가 인증 기록으로 남을 수 있습니다. 이 기록은 서비스 이용에 쓰지 않으며, 아래 연락처로 요청하면
            삭제합니다.
          <p>
            피드백은 보낸 사람을 기록하지 않아 계정 삭제와 함께 지울 수 없습니다. 내용에 이름이나 연락처 같은 개인정보는
            적지 말아 주세요. 지우고 싶은 피드백이 있으면 보낸 날짜와 내용을 알려 주시면 찾아서 삭제합니다.
          </p>
          </p>
        </section>

        <section>
          <h2>2. 보유 기간과 파기</h2>
          <p>
            이용자가 삭제를 요청할 때까지 보관합니다. 아래 연락처로 요청하면 계정과 전공, 관심 공고, 지원 기록을 지체
            없이 삭제합니다. 삭제한 정보는 복구할 수 없습니다. 장애에 대비해 하루 두 번 데이터베이스를 백업하며, 백업은
            30일이 지나면 자동으로 지워집니다. 따라서 삭제를 요청한 정보도 최대 30일 동안 백업에 남을 수 있습니다.
          </p>
        </section>

        <section>
          <h2>3. 처리 위탁과 국외 이전</h2>
          <p>서비스 운영을 위해 아래 업체에 처리를 맡깁니다. 각 업체는 맡긴 업무 외에 정보를 쓰지 않습니다.</p>
          <Table head={["업체", "맡긴 업무", "처리 위치"]} rows={PROCESSORS} />
          <p>
            Vercel과 Google을 거치는 과정에서 정보가 국외 서버로 전송될 수 있습니다. 전송은 서비스 이용 시 암호화된
            연결로 이뤄지며, 이용을 원하지 않으면 로그인하지 않거나 삭제를 요청할 수 있습니다.
          </p>
        </section>

        <section>
          <h2>4. 이용자의 권리</h2>
          <p>
            이용자는 언제든 자신의 개인정보를 열람하거나 고치거나 삭제하도록 요청하고, 처리 정지를 요구할 수 있습니다.
            전공, 관심 공고, 지원 기록은 서비스 화면에서 직접 바꾸거나 지울 수 있습니다.
          </p>
        </section>

        <section>
          <h2>5. 쿠키와 브라우저 저장소</h2>
          <p>
            로그인 상태를 유지하는 쿠키와, 이용자가 고른 화면 테마(밝게·어둡게)를 1년 동안 기억하는 쿠키를 씁니다. 공고
            목록을 빠르게 띄우려고 공고 정보를 이용자의 브라우저 저장소에 보관하며, 여기에는 개인정보가 들어가지
            않습니다. 방문 분석이나 광고 쿠키는 쓰지 않습니다.
          </p>
        </section>

        <section>
          <h2>6. 안전성 확보 조치</h2>
          <p>
            모든 연결은 HTTPS로 암호화합니다. 데이터베이스는 이용자 본인만 자신의 전공, 관심 공고, 지원 기록을 읽고 쓸
            수 있게 접근을 제한합니다.
          </p>
        </section>

        <section>
          <h2>7. 개인정보 보호책임자와 문의</h2>
          <p>
            HY-Easy 운영자 · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p>
            개인정보 침해 신고와 상담은 개인정보침해신고센터(국번 없이 118), 개인정보분쟁조정위원회(1833-6972)에서도
            받을 수 있습니다.
          </p>
        </section>

        <section>
          <h2>8. 방침 변경</h2>
          <p>이 방침이 바뀌면 시행 7일 전부터 이 페이지에 알립니다.</p>
        </section>
      </article>
      <footer className="login-footer">
        <span>HY-Easy는 한양대학교의 공식 서비스가 아닙니다.</span>
        <Link href="/login">로그인으로 돌아가기</Link>
      </footer>
    </main>
  );
}
