import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fetchBatches } from './api/client.js';
import { Header } from './components/Header.js';
import { BatchDetailsPanel } from './components/BatchDetailsPanel.js';
import { HomePage } from './pages/HomePage.js';
import { ComparePage } from './pages/ComparePage.js';
import { ReplayPage } from './pages/ReplayPage.js';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 30,
            retry: 1
        }
    }
});
const AppShell = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [showConfig, setShowConfig] = useState(false);
    const { data: batchesData, isLoading, error } = useQuery({
        queryKey: ['batches'],
        queryFn: () => fetchBatches()
    });
    const batches = batchesData?.batches ?? [];
    const batchParam = searchParams.get('batch');
    const selectedBatch = batches.find((b) => b.id === batchParam || b.name === batchParam) ||
        batches[0] ||
        null;
    const handleSelectBatch = (id) => {
        const found = batches.find((b) => b.id === id);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('batch', found?.name || id);
            return next;
        });
    };
    useEffect(() => {
        if (!batchParam && batches.length > 0) {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('batch', batches[0].name);
                return next;
            }, { replace: true });
        }
    }, [batchParam, batches, setSearchParams]);
    return (<div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header batches={batches} selectedBatchId={selectedBatch?.id || ''} onSelectBatch={handleSelectBatch} onToggleConfig={() => setShowConfig(!showConfig)} showConfig={showConfig}/>

      {showConfig && selectedBatch && (<BatchDetailsPanel batchName={selectedBatch.name} createdAt={selectedBatch.created_at} config={selectedBatch.config} onClose={() => setShowConfig(false)}/>)}

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage selectedBatch={selectedBatch} isLoadingBatches={isLoading} batchesError={error}/>}/>
          <Route path="/compare/:questionId" element={<ComparePage />}/>
          <Route path="/runs/:runId" element={<ReplayPage />}/>
          <Route path="/dashboard" element={<div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-500">
                Dashboard View (coming in Step 5)
              </div>}/>
        </Routes>
      </main>
    </div>);
};
export const App = () => {
    return (<QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>);
};
//# sourceMappingURL=App.js.map