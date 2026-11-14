export interface CodeChunk {
  id: string;
  corpus: string;
  file: string;
  start_line: number;
  end_line: number;
  content: string;
  tokens?: number;
}
