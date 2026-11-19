import React from 'react';
export const ReplayGraphSvg = ({ nodes, edges, currentStep, selectedNodeId, onSelectNode }) => {
    const visibleNodes = nodes.filter((n) => n.step <= currentStep);
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
    const nodeWidth = 220;
    const nodeHeight = 85;
    const maxX = nodes.length > 0 ? nodes[nodes.length - 1].x + nodeWidth + 80 : 800;
    const svgWidth = Math.max(maxX, 900);
    const svgHeight = 260;
    const getNodeColor = (node) => {
        if (node.isDeadEnd) {
            return {
                bg: 'fill-rose-50 dark:fill-rose-950/40',
                border: 'stroke-rose-400 dark:stroke-rose-700 stroke-dasharray="4,4"',
                text: 'text-rose-700 dark:text-rose-300'
            };
        }
        if (node.touchesGroundTruth) {
            return {
                bg: 'fill-emerald-50 dark:fill-emerald-950/40',
                border: 'stroke-emerald-500 dark:stroke-emerald-500',
                text: 'text-emerald-700 dark:text-emerald-300'
            };
        }
        if (node.type === 'question') {
            return {
                bg: 'fill-blue-50 dark:fill-blue-950/40',
                border: 'stroke-blue-400 dark:stroke-blue-600',
                text: 'text-blue-700 dark:text-blue-300'
            };
        }
        if (node.type === 'final_answer') {
            return {
                bg: 'fill-indigo-50 dark:fill-indigo-950/40',
                border: 'stroke-indigo-500 dark:stroke-indigo-500',
                text: 'text-indigo-700 dark:text-indigo-300'
            };
        }
        return {
            bg: 'fill-white dark:fill-slate-900',
            border: 'stroke-slate-300 dark:stroke-slate-700',
            text: 'text-slate-700 dark:text-slate-300'
        };
    };
    return (<div className="w-full overflow-x-auto bg-slate-100/60 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="select-none font-sans" role="region" aria-label="Replay Step Graph">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8"/>
          </marker>
        </defs>

        <g>
          {visibleEdges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.from);
            const target = nodes.find((n) => n.id === edge.to);
            if (!source || !target)
                return null;
            const startX = source.x + nodeWidth;
            const startY = source.y + nodeHeight / 2;
            const endX = target.x;
            const endY = target.y + nodeHeight / 2;
            const midX = (startX + endX) / 2;
            return (<path key={`${edge.from}->${edge.to}`} d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 8} ${endY}`} fill="none" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" className="transition-all duration-300"/>);
        })}
        </g>

        <g>
          {visibleNodes.map((node) => {
            const colors = getNodeColor(node);
            const isSelected = selectedNodeId === node.id;
            const isLatest = node.step === currentStep;
            return (<g key={node.id} transform={`translate(${node.x}, ${node.y})`} onClick={() => onSelectNode(node.id, node.step)} className="cursor-pointer transition-transform duration-200 hover:scale-[1.02]" role="button" tabIndex={0} aria-label={`Step ${node.step}: ${node.title} - ${node.subtitle}`} onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectNode(node.id, node.step);
                    }
                }}>
                <rect width={nodeWidth} height={nodeHeight} rx="10" className={`${colors.bg} ${isSelected ? 'stroke-indigo-600 dark:stroke-indigo-400 stroke-[3]' : colors.border} ${isLatest ? 'filter drop-shadow-md' : ''}`}/>

                <rect x="0" y="0" width={nodeWidth} height="26" rx="10" className="fill-slate-100 dark:fill-slate-800/80"/>

                <text x="10" y="17" className="text-[11px] font-bold uppercase tracking-wider fill-slate-600 dark:fill-slate-300">
                  {node.type === 'question' ? 'Input' : node.type === 'final_answer' ? 'End' : `Step ${node.step}`}
                </text>

                {node.isFirstHit && (<g transform={`translate(${nodeWidth - 68}, 5)`}>
                    <rect width="60" height="16" rx="4" className="fill-emerald-500"/>
                    <text x="30" y="11" textAnchor="middle" className="text-[9px] font-extrabold uppercase fill-white">
                      Found it!
                    </text>
                  </g>)}

                {node.isDeadEnd && (<g transform={`translate(${nodeWidth - 68}, 5)`}>
                    <rect width="60" height="16" rx="4" className="fill-rose-500"/>
                    <text x="30" y="11" textAnchor="middle" className="text-[9px] font-extrabold uppercase fill-white">
                      Dead End
                    </text>
                  </g>)}

                <text x="12" y="48" className={`text-xs font-bold ${node.touchesGroundTruth ? 'fill-emerald-700 dark:fill-emerald-300' : 'fill-slate-900 dark:fill-slate-100'}`}>
                  {node.title}
                </text>

                <text x="12" y="68" className="text-[11px] font-mono fill-slate-500 dark:fill-slate-400">
                  {node.subtitle}
                </text>
              </g>);
        })}
        </g>
      </svg>
    </div>);
};
//# sourceMappingURL=ReplayGraphSvg.js.map