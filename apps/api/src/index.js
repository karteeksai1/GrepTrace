import fs from 'node:fs/promises';
import path from 'node:path';
import { createPool, getAppDatabaseUrl } from '@greptrace/core';
import { createApp } from './app.js';
async function main() {
    const rootDir = process.cwd();
    const configRaw = await fs.readFile(path.resolve(rootDir, 'config', 'corpora.json'), 'utf8');
    const corporaConfig = JSON.parse(configRaw);
    const pool = createPool(getAppDatabaseUrl());
    const app = createApp({
        pool,
        corporaConfig,
        rootDir
    });
    const port = parseInt(process.env.PORT || '3001', 10);
    app.listen(port, () => {
        process.stdout.write(`GrepTrace API server listening on http://localhost:${port}\n`);
    });
}
main().catch((err) => {
    process.stderr.write(`Fatal error starting API: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map