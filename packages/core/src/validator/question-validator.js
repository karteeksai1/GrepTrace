import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
export const groundTruthSchema = z.object({
    file: z.string().min(1),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive()
}).refine((data) => data.end_line >= data.start_line, {
    message: 'end_line must be greater than or equal to start_line'
});
export const questionSchema = z.object({
    id: z.string().min(1),
    corpus: z.string().min(1),
    type: z.enum(['identifier_lookup', 'conceptual', 'multi_hop']),
    question: z.string().min(1),
    reference_answer: z.string().min(1),
    ground_truth: z.array(groundTruthSchema).min(1)
});
export const questionFileSchema = z.array(questionSchema);
async function countFileLines(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    if (content.length === 0) {
        return 0;
    }
    return content.split(/\r?\n/).length;
}
export async function validateQuestionAgainstCorpus(question, corpusRoot) {
    const issues = [];
    for (const [index, gt] of question.ground_truth.entries()) {
        const resolvedPath = path.resolve(corpusRoot, gt.file);
        const relative = path.relative(corpusRoot, resolvedPath);
        if (relative.startsWith('..') || path.isAbsolute(gt.file)) {
            issues.push({
                questionId: question.id,
                field: `ground_truth[${index}].file`,
                message: `File path escapes corpus directory: ${gt.file}`
            });
            continue;
        }
        try {
            const stat = await fs.stat(resolvedPath);
            if (!stat.isFile()) {
                issues.push({
                    questionId: question.id,
                    field: `ground_truth[${index}].file`,
                    message: `Path is not a regular file: ${gt.file}`
                });
                continue;
            }
            const lineCount = await countFileLines(resolvedPath);
            if (gt.end_line > lineCount) {
                issues.push({
                    questionId: question.id,
                    field: `ground_truth[${index}].end_line`,
                    message: `end_line ${gt.end_line} exceeds file line count ${lineCount} in ${gt.file}`
                });
            }
        }
        catch {
            issues.push({
                questionId: question.id,
                field: `ground_truth[${index}].file`,
                message: `Ground truth file does not exist: ${gt.file}`
            });
        }
    }
    return issues;
}
export async function validateQuestionsFile(filePath, corporaConfig, baseDir = process.cwd()) {
    const issues = [];
    const content = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch (err) {
        return {
            valid: false,
            issues: [{ questionId: 'file', field: 'json', message: err.message }]
        };
    }
    const schemaResult = questionFileSchema.safeParse(parsed);
    if (!schemaResult.success) {
        for (const error of schemaResult.error.errors) {
            issues.push({
                questionId: error.path[0]?.toString() ?? 'unknown',
                field: error.path.join('.'),
                message: error.message
            });
        }
        return { valid: false, issues };
    }
    const questions = schemaResult.data;
    for (const question of questions) {
        const corpusSpec = corporaConfig.corpora[question.corpus];
        if (!corpusSpec) {
            issues.push({
                questionId: question.id,
                field: 'corpus',
                message: `Unknown corpus '${question.corpus}' in corpora config`
            });
            continue;
        }
        const corpusRoot = path.resolve(baseDir, corpusSpec.path);
        const corpusIssues = await validateQuestionAgainstCorpus(question, corpusRoot);
        issues.push(...corpusIssues);
    }
    return {
        valid: issues.length === 0,
        issues
    };
}
//# sourceMappingURL=question-validator.js.map