import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchRun, fetchRunEvents } from '../api/client.js';
import {
  buildFileMap,
  buildGraphNodesAndEdges,
  calculateRunningTotals
} from '../utils/replay.js';
import { ReplayGraphSvg } from '../components/ReplayGraphSvg.js';
import { ReplayScrubber } from '../components/ReplayScrubber.js';
import { StepInspector } from '../components/StepInspector.js';
import { FileMap } from '../components/FileMap.js';
import { RagReplayView } from '../components/RagReplayView.js';
import { CodePanel } from '../components/CodePanel.js';
import { parseRunAnswer } from '../utils/highlight.js';

export const ReplayPage: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const stepFromParam = searchParams.get('step');
  const initialStep = stepFromParam ? parseInt(stepFromParam, 10) : 0;

  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-question');

  const [activeCodeSelection, setActiveCodeSelection] = useState<{
    corpus: string;
    file: string;
    start: number;
    end: number;
  } | null>(null);

  const { data: runDetail, isLoading: isLoadingRun, error: runError } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId!),
    enabled: Boolean(runId)
  });

  const { data: eventsData, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['runEvents', runId],
    queryFn: () => fetchRunEvents(runId!),
    enabled: Boolean(runId)
  });

  const events = eventsData?.events ?? [];
  const question = runDetail?.question;
  const questionText = question?.question || runDetail?.run?.question_id || 'Question';
  const groundTruthList = question?.ground_truth ?? [];

  const { nodes, edges } = useMemo(() => {
    return buildGraphNodesAndEdges(
      events,
      questionText,
      groundTruthList,
      runDetail?.run?.final_answer
    );
  }, [events, questionText, groundTruthList, runDetail?.run?.final_answer]);

  const fileMap = useMemo(() => {
    return buildFileMap(events, groundTruthList);
  }, [events, groundTruthList]);

  const totalSteps = nodes.length > 0 ? nodes.length - 1 : 0;

  useEffect(() => {
    if (nodes.length > 0) {
      const activeNode = nodes.find((n) => n.step === currentStep) || nodes[0];
      setSelectedNodeId(activeNode.id);
    }
  }, [currentStep, nodes]);

  const handleStepChange = (newStep: number) => {
    const clamped = Math.max(0, Math.min(totalSteps, newStep));
    setCurrentStep(clamped);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('step', String(clamped));
      return next;
    }, { replace: true });
  };

  const handleSelectNode = (nodeId: string, step: number) => {
    setSelectedNodeId(nodeId);
    handleStepChange(step);
  };

  const runningTotals = useMemo(() => {
    return calculateRunningTotals(events, currentStep);
  }, [events, currentStep]);

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const parsedFinal = parseRunAnswer(runDetail?.run?.final_answer);
  const allCitations = parsedFinal.citations;

  if (isLoadingRun || isLoadingEvents) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading trajectory replay...</p>
      </div>
    );
  }

  if (runError || !runDetail || !runDetail.run) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Run Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">
          {runError ? (runError as Error).message : `Run ${runId} was not found.`}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-orange-600 hover:underline">
          ← Return to Benchmark Runs
        </Link>
      </div>
    );
  }

  const { run } = runDetail;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <Link
            to={run.batch_id ? `/?batch=${encodeURIComponent(run.batch_id)}` : '/'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            <span>←</span>
            <span>Back to Benchmark Runs</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Run: {run.id.slice(0, 8)}...
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
              run.system === 'agentic' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}>
              {run.system}
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
              run.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {run.status}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-2">
          <span className="text-xs font-mono text-slate-500 block">
            {run.corpus} / {run.question_id}
          </span>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {questionText}
          </h1>
        </div>
      </div>

      {activeCodeSelection && (
        <CodePanel
          corpus={activeCodeSelection.corpus}
          filePath={activeCodeSelection.file}
          startLine={activeCodeSelection.start}
          endLine={activeCodeSelection.end}
          groundTruthRanges={groundTruthList}
          citedRanges={allCitations}
          onClose={() => setActiveCodeSelection(null)}
        />
      )}

      {run.system === 'rag' ? (
        <RagReplayView
          runDetail={runDetail}
          eventsData={eventsData}
          onInspectChunk={(file, start, end) =>
            setActiveCodeSelection({
              corpus: run.corpus,
              file,
              start,
              end
            })
          }
        />
      ) : (
        <div className="space-y-6">
          <ReplayScrubber
            currentStep={currentStep}
            totalSteps={totalSteps}
            onStepChange={handleStepChange}
            runningTotals={runningTotals}
          />

          <ReplayGraphSvg
            nodes={nodes}
            edges={edges}
            currentStep={currentStep}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <StepInspector
                node={activeNode}
                onInspectFile={(file, start, end) =>
                  setActiveCodeSelection({
                    corpus: run.corpus,
                    file,
                    start: start || 1,
                    end: end || 50
                  })
                }
              />
            </div>

            <div className="lg:col-span-1">
              <FileMap
                files={fileMap}
                onSelectFile={(file) =>
                  setActiveCodeSelection({
                    corpus: run.corpus,
                    file,
                    start: 1,
                    end: 60
                  })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
