import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {
  ATTACHMENT_RULES,
  modelPayload,
  parseModelResponse,
  estimateCost,
  trimToLimits,
  isServiceError,
  BilledClassificationError,
  failedCallUsage,
} from "../src/lib/classifier";
import { assertEvidence } from "../src/lib/domain";
import { samplePostings } from "../src/lib/sample";
import { classificationInput } from "../src/lib/normalize";
const p = samplePostings[0],
  input = classificationInput(p),
  result = p.classification!;
function response(stop = "end_turn", classification: object = { ...result, secondaryEvidence: [] }) {
  return {
    stop_reason: stop,
    content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(classification) }],
    usage: { input_tokens: 3000, output_tokens: 500 },
  };
}
for (const provider of ["claude", "anthropic"] as const) {
  it(`Haiku(${provider})는 thinking 비활성화·구조화 출력·도구 없음`, () => {
    const payload = modelPayload(provider, input);
    assert.ok("thinking" in payload && "output_config" in payload);
    assert.equal(payload.thinking.type, "disabled");
    assert.equal(payload.output_config.format.type, "json_schema");
    assert.equal("tools" in payload, false);
    assert.equal("temperature" in payload, false);
    // The shared system prompt is cached; the posting text (user message) is not.
    const system = (payload as { system: { cache_control?: { type: string } }[] }).system;
    assert.equal(system.at(-1)?.cache_control?.type, "ephemeral");
  });
}
it("Vertex 경로만 anthropic_version을 붙이고 직접 호출은 붙이지 않음", () => {
  assert.equal("anthropic_version" in modelPayload("claude", input), true);
  assert.equal("anthropic_version" in modelPayload("anthropic", input), false);
});
it("첨부 공고의 anthropic 직접 호출 페이로드에도 첨부 규칙(ATTACHMENT_RULES)을 포함", () => {
  const withAttachment = { ...input, attachment: "1. 직무 내용 본문", department: "개발팀" };
  const payload = modelPayload("anthropic", withAttachment) as {
    messages: { content: { text: string }[] }[];
  };
  assert.equal(payload.messages[0].content[0].text.startsWith(ATTACHMENT_RULES), true);
});
it("직접 호출 응답도 같은 검증(거절·잘림 차단)을 거침", () => {
  assert.deepEqual(parseModelResponse("anthropic", input, response()).classification, result);
  assert.throws(() => parseModelResponse("anthropic", input, response("refusal")));
  assert.equal(estimateCost("anthropic", 3000, 500), estimateCost("claude", 3000, 500));
});
it("text 블록을 타입으로 찾아 분류 결과 파싱", () =>
  assert.deepEqual(parseModelResponse("claude", input, response()).classification, result));
it("거절·출력 잘림을 정상 결과로 저장하지 않음", () => {
  for (const stop of ["refusal", "max_tokens"])
    assert.throws(() => parseModelResponse("claude", input, response(stop)));
});
it("스키마 위반 또는 원문과 다른 근거를 거절", () => {
  assert.throws(() =>
    parseModelResponse("claude", input, response("end_turn", { ...result, primaryRole: "없는 직군" } as never)),
  );
  assert.throws(() =>
    parseModelResponse(
      "claude",
      input,
      response("end_turn", { ...result, evidence: [{ field: "tasks", quote: "환각" }] }),
    ),
  );
});
it("보조 직군은 원문 인용이 맞는 것만 남기고 저장 형식(Role[])으로 바꿈", () => {
  const other = result.primaryRole === "기획" ? "마케팅" : "기획";
  const output = {
    ...result,
    secondaryRoles: [other, "디자인", "데이터·AI"],
    secondaryEvidence: [
      { role: other, quote: input.tasks, field: "tasks" },
      { role: "디자인", quote: "원문에 없는 영상 편집 업무", field: "tasks" },
    ],
  };
  const parsed = parseModelResponse("anthropic", input, response("end_turn", output as never));
  assert.deepEqual(parsed.classification.secondaryRoles, [other]);
  assert.deepEqual(parsed.classification.evidence, result.evidence);
  assert.equal("secondaryEvidence" in parsed.classification, false);
});
it("Gemini의 thought 블록을 설명으로 노출하지 않음", () => {
  const parsed = parseModelResponse("gemini", input, {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ thought: true, text: "hidden" }, { text: JSON.stringify({ ...result, secondaryEvidence: [] }) }],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 500, thoughtsTokenCount: 50 },
  });
  assert.equal(parsed.outputTokens, 550);
  assert.equal(parsed.classification.summary, result.summary);
});
it("대량 입력과 빈 입력을 잘라 분류하지 않고 검토로 보냄", () => {
  assert.throws(() => modelPayload("claude", { practiceInfo: "", tasks: "", qualifications: "" }));
  assert.throws(() => modelPayload("claude", { ...input, tasks: "가".repeat(30000) }));
});
it("캐시 쓰기·읽기 토큰을 따로 계산하고 전체 입력 토큰으로 기록", () => {
  const cached = {
    ...response(),
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 10000 },
  };
  const parsed = parseModelResponse("anthropic", input, cached);
  assert.equal(parsed.inputTokens, 11000);
  assert.equal(parsed.cacheReadTokens, 10000);
  // 1000 x $0.10 + 10000 x $0.01 + 500 x $0.50 per MTok
  assert.equal(parsed.costUsd, (1000 * 0.1 + 10000 * 0.01 + 500 * 0.5) / 1_000_000);
  const written = estimateCost("anthropic", 1000, 0, { writeTokens: 10000, readTokens: 0 });
  assert.equal(written, (1000 * 0.1 + 10000 * 0.125) / 1_000_000);
});
it("정가와 긴 입력 구간 비용 계산", () => {
  assert.equal(estimateCost("claude", 3000000, 500000), 2.75);
  assert.equal(estimateCost("claude", 3000, 500), 0.00055);
  assert.equal(estimateCost("gemini", 3000, 500), 0.00215);
});

describe("모델 출력 정리 (스키마 제한 미지원 대응)", () => {
  it("보조 직군: 중복·주 직군 제거 후 최대 2개, 인용은 최대 4개", () => {
    const claim = { role: "마케팅", quote: input.tasks, field: "tasks" };
    const raw = {
      ...result,
      primaryRole: "영업",
      secondaryRoles: ["영업", "마케팅", "마케팅", "기획", "디자인"],
      secondaryEvidence: Array.from({ length: 6 }, () => claim),
    };
    const trimmed = trimToLimits(raw) as { secondaryRoles: string[]; secondaryEvidence: unknown[] };
    assert.deepEqual(trimmed.secondaryRoles, ["마케팅", "기획"]);
    assert.equal(trimmed.secondaryEvidence.length, 4);
  });
  it("근거는 최대 5개", () => {
    const evidence = Array.from({ length: 7 }, () => result.evidence[0]);
    assert.equal((trimToLimits({ ...result, evidence }) as typeof result).evidence.length, 5);
  });
  it("원문 근거는 줄바꿈·연속 공백 차이를 무시하고 대조, 단어가 다르면 거절", () => {
    const multiline = { ...input, tasks: "서비스 API를\n  개발하고 테스트 코드를 작성합니다." };
    const quoted = { ...result, evidence: [{ field: "tasks" as const, quote: "서비스 API를 개발하고 테스트" }] };
    assert.doesNotThrow(() => assertEvidence(multiline, quoted));
    const wrong = { ...result, evidence: [{ field: "tasks" as const, quote: "서비스 API를 설계하고" }] };
    assert.throws(() => assertEvidence(multiline, wrong));
  });
  it("원문의 보이지 않는 제어 문자(U+009F)는 무시", () => {
    const withControl = { ...input, tasks: "이미지\u009f영상기사 등 콘텐츠 기획 및 제작" };
    const quoted = {
      ...result,
      evidence: [{ field: "tasks" as const, quote: "이미지영상기사 등 콘텐츠 기획 및 제작" }],
    };
    assert.doesNotThrow(() => assertEvidence(withControl, quoted));
  });
});

describe("trimToLimits majors", () => {
  it("전공무관이면 지정 전공을 비우고, 우대·관련에서 지정 전공과 중복을 뺌", () => {
    const any = trimToLimits({
      ...result,
      majors: { requirement: "any", required: ["경영학부"], preferred: ["경영학부", "경영학부"], related: [] },
    }) as typeof result;
    assert.deepEqual(any.majors?.required, []);
    assert.deepEqual(any.majors?.preferred, ["경영학부"]);
    const listed = trimToLimits({
      ...result,
      majors: {
        requirement: "listed",
        required: ["경영학부"],
        preferred: ["경영학부"],
        related: ["경영학부", "산업공학과", "수학과", "물리학과", "화학과", "사학과"],
      },
    }) as typeof result;
    assert.deepEqual(listed.majors?.preferred, []);
    assert.deepEqual(listed.majors?.related, ["산업공학과", "수학과", "물리학과", "화학과", "사학과"]);
  });
  it("지정 전공 없이 listed면 우대가 있을 때 any, 없을 때 unknown", () => {
    const pref = trimToLimits({
      ...result,
      majors: { requirement: "listed", required: [], preferred: ["경영학부"], related: [] },
    }) as typeof result;
    assert.equal(pref.majors?.requirement, "any");
    const none = trimToLimits({
      ...result,
      majors: { requirement: "listed", required: [], preferred: [], related: [] },
    }) as typeof result;
    assert.equal(none.majors?.requirement, "unknown");
  });
});

describe("모델 서비스 오류 구분 (재시도 횟수를 쓰지 않음)", () => {
  const apiError = (status: number) => Anthropic.APIError.generate(status, { type: "error" }, "x", new Headers());
  it("키 오류·요청 한도·서버 오류·연결 실패는 서비스 오류", () => {
    for (const status of [401, 403, 429, 500, 529])
      assert.equal(isServiceError(apiError(status)), true, String(status));
    assert.equal(isServiceError(new Anthropic.APIConnectionError({ message: "down" })), true);
    assert.equal(isServiceError({ response: { status: 503 } }), true); // Vertex (google-auth) error shape
  });
  it("잘못된 요청이나 공고 문제는 서비스 오류가 아님", () => {
    assert.equal(isServiceError(apiError(400)), false);
    assert.equal(isServiceError(new Error("원문에서 분류 근거를 찾을 수 없습니다.")), false);
    assert.equal(isServiceError(null), false);
  });
});

it("답을 받은 뒤의 실패(잘림·거절·스키마 위반)는 청구된 토큰과 원래 오류 코드를 함께 남김", () => {
  for (const bad of [response("max_tokens"), response("refusal"), response("end_turn", { primaryRole: "없는 직군" })]) {
    let caught: unknown;
    try {
      parseModelResponse("anthropic", input, bad);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof BilledClassificationError);
    assert.deepEqual(failedCallUsage(caught), {
      inputTokens: 3000,
      outputTokens: 500,
      costUsd: estimateCost("anthropic", 3000, 500),
    });
  }
  // The message stays the code the collector and queue script match on.
  assert.throws(() => parseModelResponse("claude", input, response("max_tokens")), /MODEL_STOP_max_tokens/);
});
it("모델까지 가지 않은 실패는 호출로 기록하지 않고, API가 거절한 요청은 0원 호출로 기록", () => {
  assert.equal(failedCallUsage(new Error("INPUT_REQUIRES_REVIEW")), null);
  assert.equal(failedCallUsage(new Anthropic.APIConnectionError({ message: "down" })), null);
  assert.deepEqual(failedCallUsage({ response: { status: 400 } }), { inputTokens: 0, outputTokens: 0, costUsd: 0 });
  assert.deepEqual(failedCallUsage(new Anthropic.BadRequestError(400, undefined, "bad", new Headers())), {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  });
});
