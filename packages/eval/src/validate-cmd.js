import fs from 'node:fs/promises';
import path from 'node:path';
import { validateQuestionsFile } from '@greptrace/core';
async function run() {
    const rootDir = process.cwd();
    const configPath = path.join(rootDir, 'config', 'corpora.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const corporaConfig = JSON.parse(configContent);
    const questionsDir = path.join(rootDir, 'data', 'questions');
    const files = ['express.json', 'fastapi.json'];
    let totalIssues = 0;
    for (const file of files) {
        const fullPath = path.join(questionsDir, file);
        try {
            await fs.access(fullPath);
        }
        catch {
            continue;
        }
        const result = await validateQuestionsFile(fullPath, corporaConfig, rootDir);
        if (!result.valid) {
            process.stdout.write(`Validation failed for ${file}:\n`);
            for (const issue of result.issues) {
                process.stdout.write(`  [${issue.questionId}] ${issue.field}: ${issue.message}\n`);
            }
            totalIssues += result.issues.length;
        }
        else {
            process.stdout.write(`Validation passed for ${file}\n`);
        }
    }
    if (totalIssues > 0) {
        process.exit(1);
    }
}
run().catch((err) => {
    process.stderr.write(`Validation execution error: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=validate-cmd.js.map