export interface HealthReport {
    connected: boolean;
    warmupMs: number;
    vectorExtension: boolean;
    tables: string[];
}
export declare function checkDatabaseHealth(): Promise<HealthReport>;
//# sourceMappingURL=health.d.ts.map