import { z } from 'zod';
import { CorporaConfig, Question } from '../types.js';
export declare const groundTruthSchema: z.ZodEffects<z.ZodObject<{
    file: z.ZodString;
    start_line: z.ZodNumber;
    end_line: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    file: string;
    start_line: number;
    end_line: number;
}, {
    file: string;
    start_line: number;
    end_line: number;
}>, {
    file: string;
    start_line: number;
    end_line: number;
}, {
    file: string;
    start_line: number;
    end_line: number;
}>;
export declare const questionSchema: z.ZodObject<{
    id: z.ZodString;
    corpus: z.ZodString;
    type: z.ZodEnum<["identifier_lookup", "conceptual", "multi_hop"]>;
    question: z.ZodString;
    reference_answer: z.ZodString;
    ground_truth: z.ZodArray<z.ZodEffects<z.ZodObject<{
        file: z.ZodString;
        start_line: z.ZodNumber;
        end_line: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        file: string;
        start_line: number;
        end_line: number;
    }, {
        file: string;
        start_line: number;
        end_line: number;
    }>, {
        file: string;
        start_line: number;
        end_line: number;
    }, {
        file: string;
        start_line: number;
        end_line: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "identifier_lookup" | "conceptual" | "multi_hop";
    id: string;
    corpus: string;
    question: string;
    reference_answer: string;
    ground_truth: {
        file: string;
        start_line: number;
        end_line: number;
    }[];
}, {
    type: "identifier_lookup" | "conceptual" | "multi_hop";
    id: string;
    corpus: string;
    question: string;
    reference_answer: string;
    ground_truth: {
        file: string;
        start_line: number;
        end_line: number;
    }[];
}>;
export declare const questionFileSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    corpus: z.ZodString;
    type: z.ZodEnum<["identifier_lookup", "conceptual", "multi_hop"]>;
    question: z.ZodString;
    reference_answer: z.ZodString;
    ground_truth: z.ZodArray<z.ZodEffects<z.ZodObject<{
        file: z.ZodString;
        start_line: z.ZodNumber;
        end_line: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        file: string;
        start_line: number;
        end_line: number;
    }, {
        file: string;
        start_line: number;
        end_line: number;
    }>, {
        file: string;
        start_line: number;
        end_line: number;
    }, {
        file: string;
        start_line: number;
        end_line: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "identifier_lookup" | "conceptual" | "multi_hop";
    id: string;
    corpus: string;
    question: string;
    reference_answer: string;
    ground_truth: {
        file: string;
        start_line: number;
        end_line: number;
    }[];
}, {
    type: "identifier_lookup" | "conceptual" | "multi_hop";
    id: string;
    corpus: string;
    question: string;
    reference_answer: string;
    ground_truth: {
        file: string;
        start_line: number;
        end_line: number;
    }[];
}>, "many">;
export interface ValidationIssue {
    questionId: string;
    field: string;
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
export declare function validateQuestionAgainstCorpus(question: Question, corpusRoot: string): Promise<ValidationIssue[]>;
export declare function validateQuestionsFile(filePath: string, corporaConfig: CorporaConfig, baseDir?: string): Promise<ValidationResult>;
//# sourceMappingURL=question-validator.d.ts.map