import { z } from "./zod";

export const FEEDBACK_MAX_CHARS = 2000;

/**
 * What a student sends. Anonymous: only the text and the screen it came from are stored
 * (supabase/migrations/202611230001_feedback.sql). The page is a path like "/postings", never a full URL with filters.
 */
export const feedbackSchema = z
  .object({
    message: z.string().trim().min(1).max(FEEDBACK_MAX_CHARS),
    page: z
      .string()
      .max(100)
      .regex(/^\/[\w\-/]*$/)
      .optional(),
  })
  .strict();
