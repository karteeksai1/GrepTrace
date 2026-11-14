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
