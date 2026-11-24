import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCallRow,
  normalizeMonthlyAiCost,
  recordClassificationCall,
  type ClassificationCallEntry,
} from "../src/lib/classification-ledger";

describe("classification call cost ledger", () => {
  it("appends every classification call including re-classifications without overwriting prior entries", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => {
        assert.equal(table, "classification_calls");
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      },
    } as unknown as Parameters<typeof recordClassificationCall>[0];

    const first: ClassificationCallEntry = {
      postingId: "00000000-0000-4000-8000-000000000001",
      inputHash: "h1",
      provider: "anthropic",
      model: "claude-haiku-5-5",
      promptVersion: "2026-11-20.7",
      taxonomyVersion: "2",
      inputTokens: 10_000,
      outputTokens: 350,
      costUsd: 0.0013,
      status: "succeeded",
      source: "collector",
      calledAt: "2026-11-20T01:00:00Z",
    };
    const reclassify: ClassificationCallEntry = {
      ...first,
      inputHash: "h2",
      promptVersion: "2026-11-24.1",
      costUsd: 0.0006,
      calledAt: "2026-11-24T01:00:00Z",
    };

    await recordClassificationCall(db, first);
    await recordClassificationCall(db, reclassify);

    assert.equal(inserted.length, 2);
    assert.deepEqual(inserted[0], buildCallRow(first));
    assert.deepEqual(inserted[1], buildCallRow(reclassify));
  });

  it("normalizes Postgres numeric/bigint strings into monthly cost records", () => {
    const rows = normalizeMonthlyAiCost([
      {
        month: "2026-11",
        calls: "312",
        failed_calls: "4",
        input_tokens: "3200000",
        output_tokens: "115000",
        cost_usd: "0.4125",
      },
      {
        month: "2026-10",
        calls: 0,
        failed_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: "0",
      },
    ]);
    assert.deepEqual(rows, [
      { month: "2026-11", calls: 312, failedCalls: 4, inputTokens: 3_200_000, outputTokens: 115_000, costUsd: 0.4125 },
      { month: "2026-10", calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ]);
  });
});
