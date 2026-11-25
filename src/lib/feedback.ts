import { z } from "./zod";

export const FEEDBACK_MAX_CHARS = 2000;
export const ADMIN_FEEDBACK_PAGE_SIZE = 50;
export type FeedbackFilter = "all" | "unread";
export type FeedbackPageState = { filter: FeedbackFilter; page: number };

/**
 * What a student sends. Anonymous: only the text and the screen it came from are stored
 * (supabase/migrations/202611230001_feedback.sql). The page is a path like "/postings", never a full URL with filters.
 */
export const feedbackSchema = z
  .object({
    message: z.string().max(FEEDBACK_MAX_CHARS).trim().min(1),
    page: z
      .string()
      .max(100)
      .regex(/^\/[\w\-/]*$/)
      .optional(),
  })
  .strict();

export function parseFeedbackQuery(raw: Record<string, string | string[] | undefined>): FeedbackPageState {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter: FeedbackFilter = first(raw.feedback) === "unread" ? "unread" : "all";
  const parsed = Number.parseInt(first(raw.feedbackPage) ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 10_000) : 1;
  return { filter, page };
}

export const adminFeedbackMarkReadSchema = z
  .object({
    id: z.string().uuid().optional(),
    ids: z.array(z.string().uuid()).min(1).max(ADMIN_FEEDBACK_PAGE_SIZE).optional(),
  })
  .strict()
  .refine(data => !(data.id && data.ids), { message: "id와 ids는 함께 보낼 수 없습니다." });
