export interface BatchConfig {
  systems: string[];
  corpora: string[];
  models: string[];
  repetitions: number;
  top_k: number;
  max_steps: number;
  git_commit_benchmark: string;
  git_commits_corpora: Record<string, string>;
}

export interface BatchItem {
  id: string;
  name: string;
  created_at: string;
  config: BatchConfig;
  run_counts: {
    total: number;
    completed: number;
    failed: number;
  };
}

export interface GroupSummary {
  system: string;
  corpus: string;
  question_type: string;
  total_runs: number;
  failures: number;
  hit_any_rate: number;
  hit_all_rate: number;
  mean_recall: number;
  citation_correct_rate: number;
  mean_score: number;
  score_std_dev: number;
  mean_tokens: number;
  median_tokens: number;
  mean_cost: number;
  mean_latency_ms: number;
  p95_latency_ms: number;
  mean_step_count: number;
  mean_db_time_ms: number;
  mean_active_latency_ms: number | null;
  mean_rate_limit_wait_ms: number | null;
  mean_llm_attempts: number | null;
  mean_tool_call_failure_count: number | null;
}

export interface BatchSummaryResponse {
  batch: {
    id: string;
    name: string;
    created_at: string;
    config: BatchConfig;
  };
  summaries: GroupSummary[];
}

export interface QuestionRow {
  question_id: string;
  corpus?: string;
  question_type?: string;
  agentic_run_id?: string;
  rag_run_id?: string;
  agentic_score: number;
  rag_score: number;
  agentic_hit_all: boolean;
  rag_hit_all: boolean;
  agentic_tokens: number;
  rag_tokens: number;
  agentic_cost_usd?: number;
  rag_cost_usd?: number;
  agentic_latency_ms: number;
  rag_latency_ms: number;
  agentic_active_latency_ms?: number | null;
  rag_active_latency_ms?: number | null;
  agentic_rate_limit_wait_ms?: number | null;
  rag_rate_limit_wait_ms?: number | null;
  agentic_step_count?: number | null;
  rag_step_count?: number | null;
  agentic_llm_attempts?: number | null;
  rag_llm_attempts?: number | null;
  agentic_tool_call_failure_count?: number | null;
  rag_tool_call_failure_count?: number | null;
  winner: 'agentic' | 'rag' | 'tie';
}

export interface BatchQuestionsResponse {
  batch_id: string;
  batch_name: string;
  total: number;
  questions: QuestionRow[];
}

export interface GroundTruthLocation {
  file: string;
  start_line: number;
  end_line: number;
}

export interface QuestionDetail {
  id: string;
  corpus: string;
  type: string;
  question: string;
  reference_answer: string;
  ground_truth: GroundTruthLocation[];
}

export interface RunRecord {
  id: string;
  system: 'agentic' | 'rag';
  corpus: string;
  question_id: string;
  model: string;
  started_at: string;
  finished_at?: string;
  status: 'running' | 'completed' | 'failed';
  final_answer?: string;
  total_tokens?: number;
  cost_usd?: number;
  batch_id?: string;
  repetition?: number;
}

export interface ScoreRecord {
  id: string;
  run_id: string;
  retrieval_hit_any: boolean;
  retrieval_hit_all: boolean;
  retrieval_recall: number;
  citation_correct: boolean;
  answer_score: number;
  judge_verdict: string;
  judge_reason: string;
  judge_model: string;
  judge_tokens: number;
  judge_cost_usd?: number | null;
  scored_at: string;
}

export interface RunDetailResponse {
  run: RunRecord;
  score: ScoreRecord | null;
  question: QuestionDetail | null;
}

export interface RunEvent {
  id: string;
  run_id: string;
  step: number;
  type: string;
  tool?: string;
  args?: Record<string, unknown>;
  result_summary?: string;
  result_bytes?: number;
  files_touched?: string[];
  tokens?: number;
  elapsed_ms?: number;
  db_time_ms?: number;
  created_at: string;
}

export interface RunEventsResponse {
  run_id: string;
  count: number;
  events: RunEvent[];
}

export interface CorpusFileResponse {
  corpus: string;
  path: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  content: string;
  lines: string[];
}
