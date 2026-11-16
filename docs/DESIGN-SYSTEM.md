# HY-Easy 디자인 시스템

한양대학교 현장실습 공고를 비교하는 앱 화면의 토큰과 규칙입니다. 토큰은 `src/app/tokens/`에 세 층으로 나뉘어 있고,
`src/app/globals.css`가 이 순서로 불러옵니다.

```
primitives.css   원재료 값 (색상 램프, 크기, 간격, 반경, 모션)
      ↓
semantic.css     쓰임새 이름 (--color-ink, --color-accent, --text-body …) · 라이트/다크
      ↓
components.css   컴포넌트 결정 (--focus-ring-*, --stat-value-*)
```

- 앱 CSS와 컴포넌트는 **semantic·component 층만** 읽습니다. 16진수 색상은 `tokens/` 밖에 쓰지 않습니다.
- 예외는 Astryx 연결 파일 하나입니다. `astryx-theme.css`는 Astryx 변수 이름을 앱 토큰에 연결하는데,
  `--color-accent`·`--color-error`·`--color-success`는 이름이 겹쳐서 primitive를 직접 읽습니다.
- Astryx 클래스를 직접 건드리는 규칙은 `astryx-overrides.css` 한 곳에만 둡니다(포커스 링, 제목·숫자 크기).

## 색상

한양대학교 공식 색상(hanyang.ac.kr/colors-fonts, 2026-11-10 확인)에서 출발합니다.

| 한양 색상 | 값 | primitive | 쓰임 |
|---|---|---|---|
| Hanyang Blue (PANTONE 541C) | `#0E4A84` | `--blue-700` | 주 행동 버튼, 링크, 선택 상태, 포커스 링 (`--color-accent`) |
| Hanyang Orange | `#F08100` | `--orange-500` | 마감 임박 표시 (`--color-warn-mark`, Astryx warning) |
| Hanyang Yellow Green | `#7DB928` | `--green-500` | 지원 가능 상태의 바탕 (`--color-ok-soft`) |
| Hanyang Silver | `#898C8E` | `--hy-silver` | 입력창 테두리 (`--color-edge`) |

- 파랑이 항상 주인공이고, 주황·연두·은색은 파랑 옆에서 상태를 알릴 때만 씁니다.
- 회색은 남색 기운이 섞인 `--slate-*` 램프입니다.
- 빨강(`--red-*`)은 오류에만 쓰며 한양 색상이 아닙니다.

### 라이트 / 다크

모든 semantic 색상은 `light-dark(라이트, 다크)`입니다. 요소의 `color-scheme`이 한쪽을 고르므로 테마 토글
(`html[data-theme]`)과 기기 설정이 모든 화면에 똑같이 적용됩니다.

| semantic | 라이트 | 다크 |
|---|---|---|
| `--color-paper` 페이지 바탕 | `--slate-25` | `--slate-950` (한양 남색 계열) |
| `--color-surface` 카드·패널 | `--slate-0` | `--slate-850` |
| `--color-ink` 본문 | `--slate-900` | `--slate-200` |
| `--color-muted` 보조 글 | `--slate-500` | `--slate-400` |
| `--color-accent` 주 행동 | `--blue-700` | `--blue-300` (어두운 바탕에서 읽히도록 밝힘) |

### 대비 기준

- 본문과 보조 글은 카드 바탕 위에서 **7:1 안팎** (측정: 라이트 6.93:1, 다크 8.07:1). 면책 문구 같은 본문도 보조 색으로 쓸 수 있습니다.
- 주 버튼의 글자와 바탕은 4.5:1 이상 (측정: 다크 8.48:1).

## 글자

- 글꼴: Pretendard 하나 (`--font-pretendard`).
- 위계: 페이지 제목이 화면에서 가장 큰 글자이고, 요약 숫자는 그 아래입니다.

| 토큰 | 크기 | 쓰임 |
|---|---|---|
| `--text-page-title` | 28px | 페이지 h1 ("전체 공고") |
| `--stat-value-size` | 24px | 요약 카드 숫자 (모집 중 190건) |
| `--text-lg` | 18px | 공고 제목, 그룹 제목 |
| `--text-body` | 15px | 본문 (Astryx base, 포인터 화면) |
| `--text-caption` | 14px | 보조 글, 공고 설명 (Astryx sm) — **본문은 14px 아래로 내리지 않습니다** |
| `--text-xs` | 13px | 배지·칩 같은 짧은 라벨만 |

터치 화면(1024px 미만 + coarse pointer)은 Astryx 기본값(16/14px)을 그대로 씁니다.

## 간격 · 모양 · 움직임

- 간격은 4px 단위 (`--unit-*` → `--space-3xs`…`--space-4xl`).
- 반경: 카드 12px, 입력·버튼 10px, 칩 6px, 알약 999px.
- 모션: `--dur-micro` 120ms(호버), `--dur-short` 220ms(전환), `--dur-long` 420ms(패널).

## 컴포넌트 규칙

| 컴포넌트 | 규칙 |
|---|---|
| 포커스 | 키보드로 닿는 모든 컨트롤에 `--focus-ring-width`(2px) `--focus-ring-color` 테두리, 간격 2px. Astryx 입력·셀렉터·체크박스는 보이는 껍데기에 그립니다. |
| 요약 카드 | 숫자는 `.stat-value`로 감싸 `--stat-value-size`를 따릅니다. |
| 마감 배지 | 3일 안 마감은 Hanyang Orange 바탕(Astryx warning). |
| 버튼 | 주 행동 1개만 accent 바탕, 나머지는 secondary. 문구는 짧게 (모바일 서랍에서도 한 줄). |

## 토큰을 바꿀 때

1. 새 색이 필요하면 `primitives.css`에 램프 단계를 더하고, `semantic.css`에서 쓰임새 이름으로 연결합니다.
2. 컴포넌트에 쓰는 값은 semantic을 직접 쓰거나, 컴포넌트만의 결정이면 `components.css`에 이름을 만듭니다.
3. 라이트·다크 모두에서 대비를 확인합니다.
