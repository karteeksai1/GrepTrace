export declare function getSystemPrompt(corpusName: string): string;
export declare function getRepairPrompt(): string;
export declare function formatRagUserPrompt(question: string, contextChunks: Array<{
    file: string;
    start_line: number;
    end_line: number;
    content: string;
}>): string;
//# sourceMappingURL=prompts.d.ts.map