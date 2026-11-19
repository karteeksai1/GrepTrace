import { GroundTruthLocation, RunEvent } from '../types.js';

export interface GraphNode {
  id: string;
  step: number;
  type: 'question' | 'grep' | 'glob' | 'read' | 'model_turn' | 'final_answer';
  title: string;
  subtitle: string;
  details?: Record<string, unknown>;
  outputSummary?: string;
  isDeadEnd: boolean;
  touchesGroundTruth: boolean;
  isFirstHit: boolean;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface FileVisit {
  file: string;
  firstStep: number;
  isGroundTruth: boolean;
  visitCount: number;
}

export interface RunningTotals {
  tokens: number;
  cost: number;
  elapsedMs: number;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function rangeOverlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function isDeadEndEvent(event: RunEvent): boolean {
  if (event.type === 'error') {
    return true;
  }
  const summary = (event.result_summary || '').toLowerCase();
  if (summary.includes('no matches') || summary.includes('0 matches') || summary.includes('empty result') || summary.includes('error')) {
    return true;
  }
  if (event.tool === 'grep' && event.result_bytes === 0) {
    return true;
  }
  if (event.tool === 'glob' && (event.files_touched?.length === 0 || summary.includes('found 0 files'))) {
    return true;
  }
  return false;
}

export function eventTouchesGroundTruth(
  event: RunEvent,
  groundTruthList: GroundTruthLocation[]
): boolean {
  if (!groundTruthList || groundTruthList.length === 0) {
    return false;
  }

  if (event.tool === 'read') {
    const filePath = String(event.args?.file || event.args?.path || '');
    const startLine = Number(event.args?.start_line || 1);
    const endLine = Number(event.args?.end_line || startLine);
    const normFile = normalizePath(filePath);

    return groundTruthList.some((gt) => {
      if (normalizePath(gt.file) !== normFile) {
        return false;
      }
      return rangeOverlaps(startLine, endLine, gt.start_line, gt.end_line);
    });
  }

  if (event.files_touched && event.files_touched.length > 0) {
    const normTouched = event.files_touched.map((f) => normalizePath(f));
    return groundTruthList.some((gt) => normTouched.includes(normalizePath(gt.file)));
  }

  return false;
}

export function buildGraphNodesAndEdges(
  events: RunEvent[],
  questionText: string,
  groundTruthList: GroundTruthLocation[],
  finalAnswerText?: string
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  let currentX = 50;
  const nodeWidth = 220;
  const gapX = 80;
  const defaultY = 120;

  nodes.push({
    id: 'node-question',
    step: 0,
    type: 'question',
    title: 'Question',
    subtitle: questionText.length > 40 ? questionText.slice(0, 37) + '...' : questionText,
    isDeadEnd: false,
    touchesGroundTruth: false,
    isFirstHit: false,
    x: currentX,
    y: defaultY
  });

  let foundFirstHit = false;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const prevNodeId = nodes[nodes.length - 1].id;
    currentX += nodeWidth + gapX;

    let nodeType: GraphNode['type'] = 'model_turn';
    let title = 'Model Turn';
    let subtitle = `Tokens: ${ev.tokens || 0}`;

    if (ev.tool === 'grep') {
      nodeType = 'grep';
      title = 'Grep';
      const pat = String(ev.args?.pattern || '');
      subtitle = `"${pat.length > 18 ? pat.slice(0, 15) + '...' : pat}"`;
    } else if (ev.tool === 'glob') {
      nodeType = 'glob';
      title = 'Glob';
      const pat = String(ev.args?.pattern || '*');
      subtitle = pat;
    } else if (ev.tool === 'read') {
      nodeType = 'read';
      title = 'Read File';
      const file = String(ev.args?.file || ev.args?.path || 'file');
      const start = ev.args?.start_line;
      const end = ev.args?.end_line;
      subtitle = `${file.split('/').pop()}:${start || 1}-${end || start || 1}`;
    }

    const deadEnd = isDeadEndEvent(ev);
    const touchesGt = eventTouchesGroundTruth(ev, groundTruthList);

    let isFirstHit = false;
    if (touchesGt && !foundFirstHit) {
      foundFirstHit = true;
      isFirstHit = true;
    }

    const nodeId = `node-event-${ev.id || i + 1}`;
    nodes.push({
      id: nodeId,
      step: i + 1,
      type: nodeType,
      title,
      subtitle,
      details: ev.args,
      outputSummary: ev.result_summary,
      isDeadEnd: deadEnd,
      touchesGroundTruth: touchesGt,
      isFirstHit,
      x: currentX,
      y: defaultY
    });

    edges.push({
      from: prevNodeId,
      to: nodeId
    });
  }

  if (finalAnswerText) {
    const prevNodeId = nodes[nodes.length - 1].id;
    currentX += nodeWidth + gapX;
    const finalNodeId = 'node-final-answer';

    nodes.push({
      id: finalNodeId,
      step: nodes.length,
      type: 'final_answer',
      title: 'Final Answer',
      subtitle: 'Complete',
      outputSummary: finalAnswerText,
      isDeadEnd: false,
      touchesGroundTruth: foundFirstHit,
      isFirstHit: false,
      x: currentX,
      y: defaultY
    });

    edges.push({
      from: prevNodeId,
      to: finalNodeId
    });
  }

  return { nodes, edges };
}

export function buildFileMap(
  events: RunEvent[],
  groundTruthList: GroundTruthLocation[]
): FileVisit[] {
  const map: Record<string, FileVisit> = {};
  const orderList: FileVisit[] = [];

  const gtFiles = new Set(groundTruthList.map((g) => normalizePath(g.file)));

  events.forEach((ev, idx) => {
    const files: string[] = [];
    if (ev.tool === 'read' && (ev.args?.file || ev.args?.path)) {
      files.push(String(ev.args.file || ev.args.path));
    }
    if (ev.files_touched && ev.files_touched.length > 0) {
      files.push(...ev.files_touched);
    }

    for (const f of files) {
      const norm = normalizePath(f);
      if (!map[norm]) {
        const visit: FileVisit = {
          file: norm,
          firstStep: idx + 1,
          isGroundTruth: gtFiles.has(norm),
          visitCount: 1
        };
        map[norm] = visit;
        orderList.push(visit);
      } else {
        map[norm].visitCount++;
      }
    }
  });

  return orderList;
}

export function calculateRunningTotals(
  events: RunEvent[],
  upToStep: number,
  costPer1kTokens = 0.0001
): RunningTotals {
  let tokens = 0;
  let elapsedMs = 0;

  const slice = events.slice(0, upToStep);
  for (const ev of slice) {
    tokens += ev.tokens || 0;
    elapsedMs += ev.elapsed_ms || 0;
    if (ev.type === 'llm_attempt_failed') {
      const waitMs = ev.args?.wait_ms;
      if (typeof waitMs === 'number') elapsedMs += waitMs;
    }
  }

  const cost = (tokens / 1000) * costPer1kTokens;

  return {
    tokens,
    cost: Number(cost.toFixed(6)),
    elapsedMs
  };
}
