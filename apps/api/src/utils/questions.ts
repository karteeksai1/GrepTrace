import fs from 'node:fs/promises';
import path from 'node:path';
import { Question } from '@greptrace/core';

const questionsCache: Record<string, Question[]> = {};

export async function loadQuestionsForCorpus(corpus: string, rootDir: string): Promise<Question[]> {
  if (questionsCache[corpus]) {
    return questionsCache[corpus];
  }
  const qPath = path.resolve(rootDir, 'data', 'questions', `${corpus}.json`);
  try {
    const raw = await fs.readFile(qPath, 'utf8');
    const questions: Question[] = JSON.parse(raw);
    questionsCache[corpus] = questions;
    return questions;
  } catch {
    return [];
  }
}

export async function findQuestion(
  corpus: string,
  questionId: string,
  rootDir: string
): Promise<Question | null> {
  const list = await loadQuestionsForCorpus(corpus, rootDir);
  return list.find((q) => q.id === questionId) ?? null;
}
