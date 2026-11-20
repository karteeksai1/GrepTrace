import { z } from 'zod';
import { calculateCost, GroundTruthLocation, LLMClient } from '@greptrace/core';

export type JudgeVerdict = 'correct' | 'partial' | 'incorrect';

export interface JudgeResult {
  verdict: JudgeVerdict;
  reason: string;
  score: number;
  tokens: number;
  costUsd: number;
}

const judgeOutputSchema = z.object({
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  reason: z.string().min(1)
});

export function getBlindJudgeSystemPrompt(): string {
  return `You are an impartial and strict benchmark judge evaluating an answer against a reference answer for a coding repository question.
You must be completely objective.
Evaluate whether the candidate answer accurately and factually answers the question in accordance with the reference answer.

Rubric:
- "correct" (1.0): The answer is factually correct, complete, and contains no misleading inaccuracies.
- "partial" (0.5): The answer is partially correct but incomplete, missing important details, or contains minor errors.
- "incorrect" (0.0): The answer is factually incorrect, fails to answer the question, or hallucinated claims.

Respond ONLY with a valid JSON object in this exact shape:
{
  "verdict": "correct",
  "reason": "One concise sentence explaining your evaluation."
}`;
}

export function formatBlindJudgeUserPrompt(
  question: string,
  referenceAnswer: string,
  candidateAnswer: string,
  citations: GroundTruthLocation[]
): string {
  const formattedCitations = citations.length > 0
    ? citations.map((c) => `- ${c.file}:${c.start_line}-${c.end_line}`).join('\n')
    : '(none)';

  return `Question:
${question}

Reference Answer:
${referenceAnswer}

Candidate Answer:
${candidateAnswer}

Candidate Citations:
${formattedCitations}

Judge the candidate answer. Return strictly valid JSON with fields "verdict" and "reason".`;
}

export function getJudgeRepairPrompt(): string {
  return `Your output was not valid JSON matching {"verdict": "correct"|"partial"|"incorrect", "reason": "string"}. Return strictly the valid JSON object with no surrounding prose or markdown fences.`;
}

export function parseJudgeOutput(rawText: string): { ok: true; data: { verdict: JudgeVerdict; reason: string } } | { ok: false; error: string } {
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

  try {
    const parsed = JSON.parse(jsonString);
    const validated = judgeOutputSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: validated.error.message };
    }
    return { ok: true, data: validated.data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function verdictToScore(verdict: JudgeVerdict): number {
  switch (verdict) {
    case 'correct':
      return 1.0;
    case 'partial':
      return 0.5;
    case 'incorrect':
      return 0.0;
  }
}

export async function judgeAnswer(
  llmClient: LLMClient,
  judgeModel: string,
  question: string,
  referenceAnswer: string,
  candidateAnswer: string,
  citations: GroundTruthLocation[]
): Promise<JudgeResult> {
  const systemPrompt = getBlindJudgeSystemPrompt();
  const userPrompt = formatBlindJudgeUserPrompt(
    question,
    referenceAnswer,
    candidateAnswer,
    citations
  );

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ];

  let accumulatedTokens = 0;
  let accumulatedCost = 0;

  const response = await llmClient.chat({
    model: judgeModel,
    messages,
    temperature: 0
  });

  accumulatedTokens += response.usage.totalTokens;
  accumulatedCost += calculateCost(judgeModel, response.usage.promptTokens, response.usage.completionTokens);

  const parsed = parseJudgeOutput(response.text);
  if (parsed.ok) {
    return {
      verdict: parsed.data.verdict,
      reason: parsed.data.reason,
      score: verdictToScore(parsed.data.verdict),
      tokens: accumulatedTokens,
      costUsd: accumulatedCost
    };
  }

  messages.push({ role: 'assistant' as const, content: response.text });
  messages.push({ role: 'user' as const, content: getJudgeRepairPrompt() });

  const repairResponse = await llmClient.chat({
    model: judgeModel,
    messages,
    temperature: 0
  });

  accumulatedTokens += repairResponse.usage.totalTokens;
  accumulatedCost += calculateCost(judgeModel, repairResponse.usage.promptTokens, repairResponse.usage.completionTokens);

  const repaired = parseJudgeOutput(repairResponse.text);
  if (repaired.ok) {
    return {
      verdict: repaired.data.verdict,
      reason: repaired.data.reason,
      score: verdictToScore(repaired.data.verdict),
      tokens: accumulatedTokens,
      costUsd: accumulatedCost
    };
  }

  return {
    verdict: 'incorrect',
    reason: `Judge response parse error: ${repaired.error}`,
    score: 0.0,
    tokens: accumulatedTokens,
    costUsd: accumulatedCost
  };
}
