import { z } from "./zod";
import { MAJOR_REQUIREMENTS, MAX_SECONDARY_EVIDENCE, ROLES } from "./domain";
import { SEOUL_MAJORS } from "./majors";

const majorList = (max: number) => z.array(z.enum(SEOUL_MAJORS)).max(max);
/** Which Seoul-campus majors a posting asks for, prefers, and whose coursework fits its tasks. */
export const majorsSchema = z
  .object({
    requirement: z.enum(MAJOR_REQUIREMENTS),
    required: majorList(30),
    preferred: majorList(12),
    related: majorList(5),
  })
  .strict();
export type PostingMajors = z.infer<typeof majorsSchema>;
const evidenceSchema = z.object({
  field: z.enum(["practiceInfo", "qualifications", "tasks", "attachment"]),
  quote: z.string().min(1).max(400),
});
export const classificationSchema = z
  .object({
    primaryRole: z.enum(ROLES),
    secondaryRoles: z.array(z.enum(ROLES)).max(2),
    summary: z.string().min(1).max(500),
    evidence: z.array(evidenceSchema).min(1).max(5),
    needsReview: z.boolean(),
    // Optional so classifications stored before majors existed still parse.
    majors: majorsSchema.optional(),
  })
  .strict();
export type Classification = z.infer<typeof classificationSchema>;
/**
 * What the model must return: the stored shape with majors required, plus secondaryEvidence, a quote for each
 * secondary role from the posting sentence where the student does that role's work. verifySecondaryRoles keeps only
 * the roles whose quote checks out and drops secondaryEvidence.
 * The field is last and the system prompt does not mention it on purpose. Making secondaryRoles a list of quoted
 * claims, or adding a prompt rule on secondary quotes, made Haiku leave out correct roles (삼성생명 영업 0/4,
 * 2026-11-20); a JSON-schema description on the field made it add wrong ones.
 */
export const classificationOutputSchema = z
  .object({
    primaryRole: classificationSchema.shape.primaryRole,
    secondaryRoles: classificationSchema.shape.secondaryRoles,
    summary: classificationSchema.shape.summary,
    evidence: classificationSchema.shape.evidence,
    needsReview: classificationSchema.shape.needsReview,
    majors: majorsSchema,
    secondaryEvidence: z
      .array(
        z
          .object({ role: z.enum(ROLES), quote: evidenceSchema.shape.quote, field: evidenceSchema.shape.field })
          .strict(),
      )
      .max(MAX_SECONDARY_EVIDENCE),
  })
  .strict();
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
