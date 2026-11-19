import { describe, expect, it } from 'vitest';
import { Pacer } from '../packages/eval/src/runner/batch-runner.js';
describe('Eval Pacer', () => {
    it('does not delay when interval is 0', async () => {
        const pacer = new Pacer(0);
        const start = Date.now();
        await pacer.waitForSlot();
        await pacer.waitForSlot();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50);
    });
    it('delays subsequent requests to enforce minimum interval', async () => {
        const pacer = new Pacer(60);
        const start = Date.now();
        await pacer.waitForSlot();
        await pacer.waitForSlot();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(50);
    });
});
//# sourceMappingURL=eval-pacer.test.js.map