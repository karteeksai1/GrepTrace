import fs from 'node:fs/promises';
import path from 'node:path';
const questionsCache = {};
export async function loadQuestionsForCorpus(corpus, rootDir) {
    if (questionsCache[corpus]) {
        return questionsCache[corpus];
    }
    const qPath = path.resolve(rootDir, 'data', 'questions', `${corpus}.json`);
    try {
        const raw = await fs.readFile(qPath, 'utf8');
        const questions = JSON.parse(raw);
        questionsCache[corpus] = questions;
        return questions;
    }
    catch {
        return [];
    }
}
export async function findQuestion(corpus, questionId, rootDir) {
    const list = await loadQuestionsForCorpus(corpus, rootDir);
    return list.find((q) => q.id === questionId) ?? null;
}
//# sourceMappingURL=questions.js.map