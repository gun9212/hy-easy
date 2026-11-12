import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { modelPayload, parseModelResponse, estimateCost, trimToLimits } from "../src/lib/classifier";
import { assertEvidence } from "../src/lib/domain";
import { samplePostings } from "../src/lib/sample";
import { classificationInput } from "../src/lib/normalize";
const p = samplePostings[0],
  input = classificationInput(p),
  result = p.classification!;
function response(stop = "end_turn", classification = result) {
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
  });
}
it("Vertex 경로만 anthropic_version을 붙이고 직접 호출은 붙이지 않음", () => {
  assert.equal("anthropic_version" in modelPayload("claude", input), true);
  assert.equal("anthropic_version" in modelPayload("anthropic", input), false);
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
it("Gemini의 thought 블록을 설명으로 노출하지 않음", () => {
  const parsed = parseModelResponse("gemini", input, {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ thought: true, text: "hidden" }, { text: JSON.stringify(result) }] },
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
it("정가와 긴 입력 구간 비용 계산", () => {
  assert.equal(estimateCost("claude", 3000000, 500000), 2.75);
  assert.equal(estimateCost("claude", 3000, 500), 0.00055);
  assert.equal(estimateCost("gemini", 3000, 500), 0.00215);
});

describe("모델 출력 정리 (스키마 제한 미지원 대응)", () => {
  it("보조 직군: 중복·주 직군 제거 후 최대 2개", () => {
    const raw = { ...result, primaryRole: "영업", secondaryRoles: ["영업", "마케팅", "마케팅", "기획", "디자인"] };
    assert.deepEqual((trimToLimits(raw) as typeof result).secondaryRoles, ["마케팅", "기획"]);
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
