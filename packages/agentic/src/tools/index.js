import { runGrep } from './grep.js';
import { runGlob } from './glob.js';
import { runRead } from './read.js';
export * from './sandbox.js';
export * from './grep.js';
export * from './glob.js';
export * from './read.js';
export const AGENT_TOOLS = [
    {
        name: 'grep',
        description: 'Search for regular expression patterns across files in the corpus using ripgrep. Returns matching files, line numbers, and line contents.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'The regular expression or string pattern to search for.'
                },
                path_glob: {
                    type: 'string',
                    description: 'Optional file glob filter, e.g. "lib/**/*.js" or "*.py".'
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum matching lines to return (default 50, maximum 200).'
                },
                context_lines: {
                    type: 'number',
                    description: 'Number of context lines before and after each match (default 0).'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'glob',
        description: 'Find files matching a glob pattern relative to the corpus root directory (capped at 200 entries).',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Glob pattern to match file paths, e.g. "**/*.js" or "lib/router/*.py".'
                }
            }
        }
    },
    {
        name: 'read',
        description: 'Read numbered lines from a file in the corpus. Hard-capped at 300 lines per call.',
        parameters: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Relative path to the file to read.'
                },
                path: {
                    type: 'string',
                    description: 'Alias for file parameter.'
                },
                start_line: {
                    type: 'number',
                    description: '1-indexed starting line number.'
                },
                end_line: {
                    type: 'number',
                    description: '1-indexed ending line number.'
                }
            }
        }
    }
];
export async function executeToolCall(sandbox, toolName, args) {
    if (toolName === 'grep') {
        return runGrep(sandbox, {
            pattern: String(args.pattern ?? ''),
            path_glob: args.path_glob ? String(args.path_glob) : undefined,
            max_results: typeof args.max_results === 'number' ? args.max_results : undefined,
            context_lines: typeof args.context_lines === 'number' ? args.context_lines : undefined
        });
    }
    if (toolName === 'glob') {
        return runGlob(sandbox, {
            pattern: args.pattern ? String(args.pattern) : undefined
        });
    }
    if (toolName === 'read') {
        return runRead(sandbox, {
            file: String(args.file ?? args.path ?? ''),
            start_line: typeof args.start_line === 'number' ? args.start_line : undefined,
            end_line: typeof args.end_line === 'number' ? args.end_line : undefined
        });
    }
    const output = `Unknown tool: '${toolName}'. Supported tools are grep, glob, and read.`;
    return {
        output,
        filesTouched: [],
        bytes: Buffer.byteLength(output, 'utf8')
    };
}
//# sourceMappingURL=index.js.map