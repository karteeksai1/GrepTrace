import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CorporaConfig, Question, validateQuestionAgainstCorpus, validateQuestionsFile } from '@greptrace/core';

describe('Question Validator', () => {
  const rootDir = process.cwd();
  const expressCorpusRoot = path.join(rootDir, 'corpora', 'express');

  it('validates ground truth location inside pinned corpus', async () => {
    const validQuestion: Question = {
      id: 'test-valid',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Where is createApplication?',
      reference_answer: 'In lib/express.js',
      ground_truth: [
        {
          file: 'lib/express.js',
          start_line: 1,
          end_line: 50
        }
      ]
    };

    const issues = await validateQuestionAgainstCorpus(validQuestion, expressCorpusRoot);
    expect(issues).toHaveLength(0);
  });

  it('detects path traversal outside corpus root', async () => {
    const questionWithTraversal: Question = {
      id: 'test-traversal',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Where is secret?',
      reference_answer: 'Outside corpus',
      ground_truth: [
        {
          file: '../package.json',
          start_line: 1,
          end_line: 5
        }
      ]
    };

    const issues = await validateQuestionAgainstCorpus(questionWithTraversal, expressCorpusRoot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('escapes corpus directory');
  });

  it('detects non-existent file', async () => {
    const questionWithMissingFile: Question = {
      id: 'test-missing',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Where is missing file?',
      reference_answer: 'Nowhere',
      ground_truth: [
        {
          file: 'lib/does-not-exist.js',
          start_line: 1,
          end_line: 10
        }
      ]
    };

    const issues = await validateQuestionAgainstCorpus(questionWithMissingFile, expressCorpusRoot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('does not exist');
  });

  it('detects end_line exceeding file line count', async () => {
    const questionWithExceededLine: Question = {
      id: 'test-line-overflow',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Overflow test',
      reference_answer: 'Overflow',
      ground_truth: [
        {
          file: 'lib/express.js',
          start_line: 1,
          end_line: 99999
        }
      ]
    };

    const issues = await validateQuestionAgainstCorpus(questionWithExceededLine, expressCorpusRoot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('exceeds file line count');
  });

  it('validates question files on disk against corpora config', async () => {
    const corporaConfig: CorporaConfig = {
      corpora: {
        express: {
          path: 'corpora/express',
          commit: 'cf6722bf89a86905281d9160b6482e08166b5ef0'
        }
      }
    };

    const result = await validateQuestionsFile(
      path.join(rootDir, 'data', 'questions', 'express.json'),
      corporaConfig,
      rootDir
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
