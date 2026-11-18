export type SystemType = 'agentic' | 'rag';

export type QuestionType = 'identifier_lookup' | 'conceptual' | 'multi_hop';

export type RunStatus = 'running' | 'completed' | 'failed';

export interface GroundTruthLocation {
  file: string;
  start_line: number;
  end_line: number;
}

export interface Question {
  id: string;
  corpus: string;
  type: QuestionType;
  question: string;
  reference_answer: string;
  ground_truth: GroundTruthLocation[];
}

export interface Run {
  id: string;
  system: SystemType;
  corpus: string;
  question_id: string;
  model: string;
  started_at: Date;
  finished_at?: Date | null;
  status: RunStatus;
  final_answer?: string | null;
  total_tokens: number;
  cost_usd: number;
  batch_id?: string | null;
  repetition?: number | null;
}

export interface EventInput {
  run_id: string;
  step: number;
  type: string;
  tool?: string | null;
  args?: Record<string, unknown> | null;
  result_summary?: string | null;
  result_bytes?: number | null;
  files_touched?: string[];
  tokens?: number;
  elapsed_ms?: number;
  db_time_ms?: number;
}

export interface EventRecord extends EventInput {
  id: string;
  created_at: Date;
}

export interface CorpusSpec {
  path: string;
  commit: string;
}

export interface CorporaConfig {
  corpora: Record<string, CorpusSpec>;
}

export interface BatchConfig {
  systems: SystemType[];
  corpora: string[];
  models: string[];
  repetitions: number;
  top_k?: number;
  max_steps?: number;
  git_commit_benchmark: string;
  git_commits_corpora: Record<string, string>;
}

export interface BatchRecord {
  id: string;
  name: string;
  created_at: Date;
  config: BatchConfig;
}

export type JudgeVerdict = 'correct' | 'partial' | 'incorrect';

export interface ScoreRecord {
  id: string;
  run_id: string;
  retrieval_hit_any: boolean;
  retrieval_hit_all: boolean;
  retrieval_recall: number;
  citation_correct: boolean;
  answer_score: number;
  judge_verdict: JudgeVerdict;
  judge_reason: string;
  judge_model: string;
  judge_tokens: number;
  judge_cost_usd?: number | null;
  scored_at: Date;
}
