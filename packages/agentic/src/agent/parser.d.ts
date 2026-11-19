import { GroundTruthLocation } from '@greptrace/core';
export interface FinalAnswerPayload {
    answer: string;
    citations: GroundTruthLocation[];
}
export declare function parseFinalAnswer(rawText: string): {
    ok: true;
    data: FinalAnswerPayload;
} | {
    ok: false;
    error: string;
};
//# sourceMappingURL=parser.d.ts.map