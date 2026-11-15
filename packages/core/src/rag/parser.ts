import { z } from 'zod';
import { GroundTruthLocation } from '../types.js';

export interface FinalAnswerPayload {
  answer: string;
  citations: GroundTruthLocation[];
}

const citationSchema = z.object({
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive()
}).refine((data) => data.end_line >= data.start_line, {
  message: 'end_line must be greater than or equal to start_line'
});

const finalAnswerSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(citationSchema)
});

export function parseFinalAnswer(rawText: string): { ok: true; data: FinalAnswerPayload } | { ok: false; error: string } {
  const trimmed = rawText.trim();
  let jsonString = trimmed;

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = trimmed.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      ok: false,
      error: `JSON parse error: ${(err as Error).message}`
    };
  }

  const result = finalAnswerSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
    };
  }

  return {
    ok: true,
    data: result.data
  };
}
