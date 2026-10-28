/* global ELK */
// Browser side of docs/tools/drawio.mjs. Two jobs:
//  - layout: turns diagram models into draw.io files (UML shapes of draw.io's own libraries), positions computed
//    with ELK; the files are the editable sources in docs/diagrams/*.drawio;
//  - export: opens each .drawio file in draw.io itself (embed.diagrams.net) and saves the PNG it exports.
const FONT = 12;
const LINE = 16;
const measure = document.createElement('canvas').getContext('2d');
measure.font = `${FONT}px Helvetica, Arial, sans-serif`;
const tw = (s) => measure.measureText(s).width;
const log = (s) => {
  document.getElementById('log').textContent += `\n${s}`;
  fetch('/log', { method: 'POST', body: s });
};
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n) => Math.round(n * 10) / 10;
const safe = (id) => `n-${String(id).replace(/[^\w.-]/g, '_')}`;

function wrap(text, max) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/ +/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (line && tw(t) > max) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
function box(text, max, padX = 24, padY = 14) {
  const lines = wrap(text, max);
  return {
    lines,
    w: Math.ceil(Math.max(...lines.map(tw), 8) + padX),
    h: lines.length * LINE + padY,
    html: lines.map(htmlEsc).join('<br>'),
  };
}

// ---------------------------------------------------------------- styles (draw.io)
const BASE = 'html=1;whiteSpace=wrap;fontSize=12;fontFamily=Helvetica;';
const S = {
  rect: `rounded=0;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  round: `rounded=1;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  stadium: `rounded=1;arcSize=50;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  circle: `ellipse;${BASE}fillColor=#fff2cc;strokeColor=#d6b656;`,
  diamond: `rhombus;${BASE}fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;`,
  cylinder: `shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=10;${BASE}fillColor=#d5e8d4;strokeColor=#82b366;`,
  menu: `rounded=0;${BASE}fillColor=#eeeeee;strokeColor=#999999;fontStyle=1;`,
  group: `rounded=0;${BASE}verticalAlign=top;fillColor=#f9f9f9;strokeColor=#999999;dashed=1;fontStyle=1;container=1;collapsible=0;`,
  actor: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;outlineConnect=0;${BASE}`,
  usecase: `ellipse;${BASE}fillColor=#ffffff;strokeColor=#333333;`,
  boundary: `rounded=0;${BASE}verticalAlign=top;fillColor=none;strokeColor=#333333;fontStyle=1;fontSize=13;container=1;collapsible=0;`,
  state: `rounded=1;arcSize=35;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  initial: 'ellipse;html=1;shape=startState;fillColor=#000000;strokeColor=#000000;',
  final: 'ellipse;html=1;shape=endState;fillColor=#000000;strokeColor=#000000;',
  composite: `swimlane;rounded=1;arcSize=6;startSize=26;${BASE}fillColor=#f5f5f5;strokeColor=#666666;fontStyle=1;container=1;collapsible=0;`,
  note: `shape=note;size=12;${BASE}fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;align=left;spacingLeft=6;`,
  action: `rounded=1;arcSize=25;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  decision: `rhombus;${BASE}fillColor=#fff2cc;strokeColor=#d6b656;fontSize=11;`,
  lane: `swimlane;startSize=30;${BASE}fillColor=#e6e6e6;swimlaneFillColor=#ffffff;strokeColor=#666666;fontStyle=1;fontSize=13;container=1;collapsible=0;`,
  entity: `rounded=0;${BASE}fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=1;`,
  entityExt: `rounded=0;${BASE}fillColor=#f5f5f5;strokeColor=#999999;dashed=1;fontColor=#555555;`,
  attribute: `ellipse;${BASE}fillColor=#ffffff;strokeColor=#666666;fontSize=11;`,
  keyAttribute: `ellipse;${BASE}fillColor=#ffffff;strokeColor=#666666;fontSize=11;fontStyle=4;`,
  relationship: `rhombus;${BASE}fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=11;`,
  lifeline: `shape=umlLifeline;perimeter=lifelinePerimeter;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;size=40;${BASE}fillColor=#dae8fc;strokeColor=#6c8ebf;`,
  actorLifeline: `shape=umlLifeline;participant=umlActor;perimeter=lifelinePerimeter;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;size=40;verticalAlign=top;spacingTop=40;${BASE}`,
  frame: 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;width=56;height=22;fontSize=11;fontStyle=1;fillColor=none;strokeColor=#666666;',
  text: `text;${BASE}align=left;verticalAlign=top;fillColor=none;strokeColor=none;fontSize=11;`,
  classBox: 'swimlane;fontStyle=0;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;whiteSpace=wrap;fontSize=12;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  classMembers: 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=11;',
  classLine: 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#6c8ebf;',
};
const EDGE = 'html=1;rounded=1;fontSize=11;fontFamily=Helvetica;labelBackgroundColor=#ffffff;';
const ARROW = {
  end: 'endArrow=block;endFill=1;endSize=8;',
  none: 'endArrow=none;',
  // laid out from source to target, the arrow drawn at the source (keeps a flow against the layout's direction)
  start: 'endArrow=none;startArrow=block;startFill=1;startSize=8;',
  open: 'endArrow=open;endFill=0;endSize=10;',
  triangle: 'endArrow=block;endFill=0;endSize=12;',
  diamond: 'endArrow=none;startArrow=diamondThin;startFill=0;startSize=14;',
  diamondFilled: 'endArrow=none;startArrow=diamondThin;startFill=1;startSize=14;',
};

// ---------------------------------------------------------------- draw.io document
class Doc {
  constructor() {
    this.cells = [];
    this.seq = 0;
  }
  vertex(o) {
    const id = o.id ?? `c${++this.seq}`;
    this.cells.push(`<mxCell id="${xmlEsc(id)}" value="${xmlEsc(o.value ?? '')}" style="${xmlEsc(o.style)}" vertex="1" parent="${xmlEsc(o.parent ?? '1')}"><mxGeometry x="${r(o.x)}" y="${r(o.y)}" width="${r(o.w)}" height="${r(o.h)}" as="geometry"/></mxCell>`);
    return id;
  }
  edge(o) {
    const id = o.id ?? `c${++this.seq}`;
    let geo = `<mxGeometry ${o.value ? `x="${r(o.lx ?? 0)}" y="${r(o.ly ?? 0)}" ` : ''}relative="1" as="geometry">`;
    if (o.sourcePoint) geo += `<mxPoint x="${r(o.sourcePoint.x)}" y="${r(o.sourcePoint.y)}" as="sourcePoint"/>`;
    if (o.targetPoint) geo += `<mxPoint x="${r(o.targetPoint.x)}" y="${r(o.targetPoint.y)}" as="targetPoint"/>`;
    if (o.points?.length) geo += `<Array as="points">${o.points.map((p) => `<mxPoint x="${r(p.x)}" y="${r(p.y)}"/>`).join('')}</Array>`;
    if (o.offset) geo += `<mxPoint x="${r(o.offset.x)}" y="${r(o.offset.y)}" as="offset"/>`;
    geo += '</mxGeometry>';
    const st = o.source ? ` source="${xmlEsc(o.source)}"` : '';
    const tg = o.target ? ` target="${xmlEsc(o.target)}"` : '';
    this.cells.push(`<mxCell id="${xmlEsc(id)}" value="${xmlEsc(o.value ?? '')}" style="${xmlEsc(o.style)}" edge="1" parent="${xmlEsc(o.parent ?? '1')}"${st}${tg}>${geo}</mxCell>`);
    return id;
  }
  xml(name) {
    return `<mxfile host="CampusStay FPT (docs/tools/drawio.mjs)" type="device"><diagram id="${xmlEsc(name)}" name="${xmlEsc(name)}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${this.cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
  }
}

// ---------------------------------------------------------------- ELK helpers
const elk = new ELK();
const DIR = { TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };
function rootOptions(dir, extra = {}) {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': DIR[dir] ?? dir ?? 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': '55',
    'elk.spacing.nodeNode': '32',
    'elk.layered.spacing.edgeNodeBetweenLayers': '22',
    'elk.spacing.edgeNode': '18',
    'elk.spacing.edgeEdge': '14',
    'elk.spacing.edgeLabel': '4',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.json.edgeCoords': 'ROOT',
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    ...extra,
  };
}
// Absolute positions of every laid-out shape (ELK gives children relative to their parent).
function absolutes(graph) {
  const abs = new Map();
  const walk = (n, ox, oy) => {
    for (const c of n.children ?? []) {
      const p = { x: ox + c.x, y: oy + c.y, w: c.width, h: c.height };
      abs.set(c.id, p);
      walk(c, p.x, p.y);
    }
  };
  walk(graph, 0, 0);
  return abs;
}
// Distance from a point to the outline of a box.
const border = (p, b) => {
  const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
  const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
  if (dx || dy) return Math.hypot(dx, dy);
  return Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y);
};
// An ELK edge as absolute points, start and end constraints and the label's place along the path.
function route(e, abs) {
  const sec = e.sections?.[0];
  if (!sec) return null;
  const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
  const src = abs.get(e.sources[0]);
  const tgt = abs.get(e.targets[0]);
  // Edge coordinates should be absolute (elk.json.edgeCoords = ROOT), but some come relative to the edge's
  // container: take the reading whose ends lie on the outlines of the two shapes.
  const box = e.container && abs.get(e.container);
  const fit = (o) => (src ? border({ x: pts[0].x + o.x, y: pts[0].y + o.y }, src) : 0) + (tgt ? border({ x: pts.at(-1).x + o.x, y: pts.at(-1).y + o.y }, tgt) : 0);
  const off = box && fit(box) < fit({ x: 0, y: 0 }) ? { x: box.x, y: box.y } : { x: 0, y: 0 };
  return { pts: pts.map((p) => ({ x: p.x + off.x, y: p.y + off.y })), off };
}
// Moves the end p of a straight segment (coming from q) onto the outline of a diamond drawn in box b.
function ontoDiamond(p, q, b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (Math.abs(p.x - q.x) < 0.5) {
    const k = Math.max(0, 1 - Math.abs(p.x - cx) / (b.w / 2));
    return { x: p.x, y: p.y <= cy ? cy - (b.h / 2) * k : cy + (b.h / 2) * k };
  }
  if (Math.abs(p.y - q.y) < 0.5) {
    const k = Math.max(0, 1 - Math.abs(p.y - cy) / (b.h / 2));
    return { x: p.x <= cx ? cx - (b.w / 2) * k : cx + (b.w / 2) * k, y: p.y };
  }
  return p;
}
function constraint(p, b, side) {
  const x = Math.min(1, Math.max(0, (p.x - b.x) / b.w));
  const y = Math.min(1, Math.max(0, (p.y - b.y) / b.h));
  return `${side}X=${r(x * 1000) / 1000};${side}Y=${r(y * 1000) / 1000};${side}Dx=0;${side}Dy=0;${side}Perimeter=0;`;
}
// Relative label position (draw.io: x in [-1, 1] along the path, plus an offset) for a label centred at c.
function labelAt(pts, c) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push({ a, b, len, from: total });
    total += len;
  }
  let best = { d: Infinity };
  for (const s of seg) {
    const dot = (c.x - s.a.x) * (s.b.x - s.a.x) + (c.y - s.a.y) * (s.b.y - s.a.y);
    const t = s.len ? Math.max(0, Math.min(1, dot / (s.len * s.len))) : 0;
    const p = { x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) };
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < best.d) best = { d, p, at: s.from + t * s.len };
  }
  return { lx: total ? (2 * best.at) / total - 1 : 0, offset: { x: c.x - best.p.x, y: c.y - best.p.y } };
}

// ---------------------------------------------------------------- generic graph (flow, state, use case, class)
function nodeBox(n, model) {
  if (n.shape === 'initial') return { w: 26, h: 26, html: '' };
  if (n.shape === 'final') return { w: 28, h: 28, html: '' };
  if (n.shape === 'actor') {
    const b = box(n.label, 110, 0, 0);
    return { w: Math.max(40, b.w), h: 62 + b.h, html: b.html, actor: true };
  }
  if (n.shape === 'class') return classBox(n);
  const max = n.shape === 'usecase' ? 190 : n.shape === 'note' ? 210 : model.kind === 'state' ? 170 : model.kind === 'flow' ? 250 : 210;
  const b = box(n.label, max, n.shape === 'diamond' || n.shape === 'decision' ? 50 : n.shape === 'usecase' ? 46 : 26,
    n.shape === 'diamond' || n.shape === 'decision' ? 34 : n.shape === 'usecase' ? 26 : n.shape === 'circle' ? 40 : 14);
  if (n.shape === 'circle') b.w = b.h = Math.max(b.w, b.h, 90);
  b.w = Math.max(b.w, n.shape === 'state' ? 90 : 60);
  b.h = Math.max(b.h, 36);
  return b;
}
function classBox(n) {
  const head = n.stereotype ? 42 : 28;
  const fields = n.fields ?? [];
  const methods = n.methods ?? [];
  const width = Math.ceil(Math.max(130, tw(n.name) + 40, ...[...fields, ...methods].map((m) => tw(m) * 0.95 + 20)));
  const fh = fields.length ? fields.length * 17 + 8 : 0;
  const mh = methods.length ? methods.length * 17 + 8 : 0;
  const lineH = fields.length && methods.length ? 8 : 0;
  return { w: width, h: head + fh + lineH + mh + (fields.length || methods.length ? 0 : 10), head, fh, mh, lineH };
}
function styleOf(n, model) {
  if (n.shape === 'actor') return S.actor;
  if (model.kind === 'state') return S[n.shape] ?? S.state;
  if (model.kind === 'activity') return S[n.shape] ?? S.action;
  return S[n.shape] ?? S.rect;
}
function edgeStyle(e, model, straight) {
  let st = (straight ? 'edgeStyle=none;' : 'edgeStyle=none;') + EDGE + (ARROW[e.arrow ?? 'end'] ?? ARROW.end);
  if (e.dashed) st += 'dashed=1;';
  if (e.thick) st += 'strokeWidth=2;';
  return st;
}

function hasLoop(model) {
  const out = new Map();
  for (const e of model.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map();
  const visit = (id) => {
    state.set(id, 1);
    for (const t of out.get(id) ?? []) if (state.get(t) === 1 || (!state.has(t) && visit(t))) return true;
    state.set(id, 2);
    return false;
  };
  return model.nodes.some((n) => !state.has(n.id) && visit(n.id));
}

async function layoutGraph(model) {
  const sizes = new Map();
  const groups = new Map((model.groups ?? []).map((g) => [g.id, g]));
  const mk = new Map();
  for (const g of model.groups ?? []) {
    const title = box(g.label ?? '', 600, 30, 0);
    mk.set(g.id, { id: g.id, children: [], layoutOptions: { 'elk.padding': `[top=${model.kind === 'state' ? 40 : 38},left=18,bottom=${model.kind === 'state' ? 44 : 18},right=18]`, 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${title.w + 20}, 60)`, ...(g.dir ? { 'elk.direction': DIR[g.dir] } : {}) } });
  }
  // A flow chart with a loop: the order of the model is the order of the flow, so the loop is broken where it goes back
  // to an earlier node.
  const flow = model.kind === 'flow' && hasLoop(model) ? { 'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER' } : {};
  const graph = { id: 'root', layoutOptions: rootOptions(model.dir, { ...flow, ...model.elk }), children: [], edges: [] };
  for (const g of model.groups ?? []) (g.parent && mk.has(g.parent) ? mk.get(g.parent).children : graph.children).push(mk.get(g.id));
  for (const n of model.nodes) {
    const b = nodeBox(n, model);
    sizes.set(n.id, b);
    const node = { id: n.id, width: b.w, height: b.h };
    (n.parent && mk.has(n.parent) ? mk.get(n.parent).children : graph.children).push(node);
  }
  const labels = new Map();
  model.edges.forEach((e, i) => {
    const lb = e.label ? box(e.label, model.labelWidth ?? 170, 8, 4) : null;
    labels.set(`e${i}`, lb);
    // Labels sit on their line (ELK keeps room for them there), so it is clear which line they name.
    graph.edges.push({ id: `e${i}`, sources: [e.from], targets: [e.to], labels: lb && !model.straight ? [{ text: e.label, width: lb.w, height: lb.h, layoutOptions: { 'elk.edgeLabels.inline': 'true' } }] : [] });
  });
  const res = await elk.layout(graph);
  const abs = absolutes(res);
  const doc = new Doc();
  const emitted = new Set();
  // Containers first (parents before children), then shapes, then edges.
  const order = [...(model.groups ?? [])];
  const depth = (g) => (g.parent ? 1 + depth(groups.get(g.parent)) : 0);
  order.sort((a, b) => depth(a) - depth(b));
  const rel = (id) => {
    const a = abs.get(id);
    const parent = model.nodes.find((n) => n.id === id)?.parent ?? groups.get(id)?.parent;
    const pa = parent ? abs.get(parent) : { x: 0, y: 0 };
    return { x: a.x - pa.x, y: a.y - pa.y, w: a.w, h: a.h, parent: parent ? safe(parent) : '1' };
  };
  if (model.kind === 'flow') {
    const ends = new Set(model.edges.flatMap((e) => [e.from, e.to]));
    for (const g of [...order].reverse()) {
      if (ends.has(g.id)) continue;
      const box = abs.get(g.id);
      const inside = [...model.nodes.filter((n) => n.parent === g.id), ...order.filter((x) => x.parent === g.id)].map((n) => abs.get(n.id));
      if (inside.length) box.h = Math.min(box.h, Math.max(...inside.map((c) => c.y + c.h)) - box.y + 18);
    }
  }
  for (const g of order) {
    const p = rel(g.id);
    const st = g.style === 'composite' ? S.composite : g.style === 'boundary' ? S.boundary : g.style === 'lane' ? S.lane : S.group;
    doc.vertex({ id: safe(g.id), value: htmlEsc(g.label ?? ''), style: st, ...p });
  }
  for (const n of model.nodes) {
    const p = rel(n.id);
    const b = sizes.get(n.id);
    if (n.shape === 'class') {
      emitClass(doc, n, p, b);
      continue;
    }
    doc.vertex({ id: safe(n.id), value: b.html ?? '', style: styleOf(n, model), ...p });
    emitted.add(n.id);
  }
  res.edges.forEach((e) => {
    const src = model.edges[Number(e.id.slice(1))];
    if (src.invisible) return;
    const lb = labels.get(e.id);
    const base = { source: safe(src.from), target: safe(src.to), value: lb?.html ?? '' };
    let style = edgeStyle(src, model, model.straight);
    if (model.straight) {
      doc.edge({ ...base, style, lx: src.labelAt ?? 0 });
      return;
    }
    const rt = route(e, abs);
    if (!rt) {
      doc.edge({ ...base, style });
      return;
    }
    const { pts, off } = rt;
    const rhombus = (id) => ['diamond', 'decision'].includes(model.nodes.find((n) => n.id === id)?.shape);
    if (rhombus(src.from) && pts.length > 1) pts[0] = ontoDiamond(pts[0], pts[1], abs.get(src.from));
    if (rhombus(src.to) && pts.length > 1) pts[pts.length - 1] = ontoDiamond(pts.at(-1), pts.at(-2), abs.get(src.to));
    style += constraint(pts[0], abs.get(src.from), 'exit') + constraint(pts.at(-1), abs.get(src.to), 'entry');
    const el = e.labels?.[0];
    const lab = el && lb ? labelAt(pts, { x: el.x + el.width / 2 + off.x, y: el.y + el.height / 2 + off.y }) : {};
    doc.edge({ ...base, style, points: pts.slice(1, -1), ...lab });
  });
  return doc;
}
function emitClass(doc, n, p, b) {
  const id = safe(n.id);
  const title = n.stereotype ? `«${htmlEsc(n.stereotype)}»<br><b>${htmlEsc(n.name)}</b>` : `<b>${htmlEsc(n.name)}</b>`;
  doc.vertex({ id, value: title, style: `${S.classBox}startSize=${b.head};`, ...p });
  let y = b.head;
  if (n.fields?.length) {
    doc.vertex({ value: n.fields.map(htmlEsc).join('<br>'), style: S.classMembers, parent: id, x: 0, y, w: p.w, h: b.fh });
    y += b.fh;
  }
  if (b.lineH) {
    doc.vertex({ value: '', style: S.classLine, parent: id, x: 0, y, w: p.w, h: b.lineH });
    y += b.lineH;
  }
  if (n.methods?.length) doc.vertex({ value: n.methods.map(htmlEsc).join('<br>'), style: S.classMembers, parent: id, x: 0, y, w: p.w, h: b.mh });
}

// ---------------------------------------------------------------- use case diagram
// Actors left of the system boundary; the use cases an actor uses in one left-aligned column, so every association
// ends at the left point of its ellipse and no line crosses another ellipse. «include»/«extend» between two of them
// run as brackets on the right of the column; use cases reached only that way sit in a second column.
function layoutUseCase(model) {
  const doc = new Doc();
  const actors = model.nodes.filter((n) => n.shape === 'actor');
  const isActor = new Set(actors.map((a) => a.id));
  const ucs = model.nodes.filter((n) => !isActor.has(n.id));
  const size = new Map(ucs.map((n) => [n.id, nodeBox(n, model)]));
  const assoc = model.edges.filter((e) => !e.invisible && (isActor.has(e.from) || isActor.has(e.to)));
  const deps = model.edges.filter((e) => !e.invisible && !isActor.has(e.from) && !isActor.has(e.to));
  const actorOf = new Map();
  for (const e of assoc) {
    const [a, u] = isActor.has(e.from) ? [e.from, e.to] : [e.to, e.from];
    if (!actorOf.has(u)) actorOf.set(u, a);
  }
  const col1 = actors.flatMap((a) => ucs.filter((u) => actorOf.get(u.id) === a.id));
  const col2 = ucs.filter((u) => !actorOf.has(u.id));
  const GAP = 16;
  const title = box(model.groups?.[0]?.label ?? '', 600, 30, 0);
  const bx = 220;
  const x1 = bx + 36;
  const pos = new Map();
  let y = 50;
  col1.forEach((u, i) => {
    if (i && actorOf.get(u.id) !== actorOf.get(col1[i - 1].id)) y += 28;
    const b = size.get(u.id);
    pos.set(u.id, { x: x1, y, w: b.w, h: b.h });
    y += b.h + GAP;
  });
  const mid = (id) => pos.get(id).y + pos.get(id).h / 2;
  let right = Math.max(x1 + 200, ...col1.map((u) => x1 + size.get(u.id).w));
  // Brackets: one track per bracket, tracks reused when their spans do not overlap.
  const inner = deps.filter((e) => actorOf.has(e.from) && actorOf.has(e.to))
    .map((e) => ({ e, lo: Math.min(mid(e.from), mid(e.to)), hi: Math.max(mid(e.from), mid(e.to)) }))
    .sort((a, b) => a.hi - a.lo - (b.hi - b.lo));
  const tracks = [];
  for (const k of inner) {
    let t = tracks.findIndex((spans) => spans.every((s) => s.hi + 6 < k.lo || k.hi + 6 < s.lo));
    if (t < 0) t = tracks.push([]) - 1;
    tracks[t].push(k);
    k.track = t;
  }
  const step = inner.some((k) => k.e.label) ? 48 : 22;
  const trackX = (t) => right + 40 + t * step;
  if (tracks.length) right = trackX(tracks.length - 1) + 20;
  // Second column, level with the use case that includes or extends it.
  let y2 = 50;
  const x2 = right + 70;
  for (const u of col2) {
    const src = deps.find((e) => e.to === u.id && pos.has(e.from)) ?? deps.find((e) => e.from === u.id && pos.has(e.to));
    const b = size.get(u.id);
    const want = src ? mid(isActor.has(src.from) ? src.to : src.from === u.id ? src.to : src.from) - b.h / 2 : y2;
    const at = Math.max(want, y2);
    pos.set(u.id, { x: x2, y: at, w: b.w, h: b.h });
    y2 = at + b.h + GAP;
  }
  if (col2.length) right = Math.max(right, ...col2.map((u) => x2 + size.get(u.id).w));
  const height = Math.max(y, y2) + 10;
  const width = Math.max(right + 30, bx + title.w + 40) - bx;
  const boundary = safe(model.groups?.[0]?.id ?? 'system');
  doc.vertex({ id: boundary, value: htmlEsc(model.groups?.[0]?.label ?? ''), style: S.boundary, x: bx, y: 0, w: width, h: height });
  for (const u of ucs) {
    const p = pos.get(u.id);
    doc.vertex({ id: safe(u.id), value: size.get(u.id).html, style: S.usecase, parent: boundary, x: p.x - bx, y: p.y, w: p.w, h: p.h });
  }
  // Actors level with the middle of their use cases, one under the other.
  let below = 0;
  for (const a of actors) {
    const own = col1.filter((u) => actorOf.get(u.id) === a.id).map((u) => mid(u.id));
    const want = own.length ? (Math.min(...own) + Math.max(...own)) / 2 - 35 : below;
    const ay = Math.max(want, below);
    doc.vertex({ id: safe(a.id), value: htmlEsc(a.label), style: S.actor, x: 50, y: ay, w: 40, h: 70 });
    below = ay + 70 + 30 + box(a.label, 40, 0, 0).h;
  }
  const ends = 'exitDx=0;exitDy=0;exitPerimeter=0;entryDx=0;entryDy=0;entryPerimeter=0;';
  for (const e of assoc) {
    const [a, u] = isActor.has(e.from) ? [e.from, e.to] : [e.to, e.from];
    const side = pos.get(u).x > bx ? 'entryX=0;entryY=0.5;' : 'entryX=1;entryY=0.5;';
    doc.edge({ source: safe(a), target: safe(u), style: `edgeStyle=none;${EDGE}${ARROW.none}exitX=1;exitY=0.5;${side}${ends}` });
  }
  for (const e of deps) {
    const lb = e.label ? box(e.label, 120, 8, 4) : null;
    let style = `edgeStyle=none;${EDGE}${ARROW[e.arrow ?? 'end'] ?? ARROW.end}${e.dashed ? 'dashed=1;' : ''}`;
    const k = inner.find((x) => x.e === e);
    let points = [];
    let lab = {};
    if (k) {
      const tx = trackX(k.track);
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      points = [{ x: tx, y: mid(e.from) }, { x: tx, y: mid(e.to) }];
      style += `exitX=1;exitY=0.5;entryX=1;entryY=0.5;${ends}`;
      if (lb) lab = labelAt([{ x: a.x + a.w, y: mid(e.from) }, ...points, { x: b.x + b.w, y: mid(e.to) }], { x: tx, y: (mid(e.from) + mid(e.to)) / 2 });
    } else {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      const forward = a.x < b.x;
      const mx = forward ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
      points = mid(e.from) === mid(e.to) ? [] : [{ x: mx, y: mid(e.from) }, { x: mx, y: mid(e.to) }];
      style += forward ? `exitX=1;exitY=0.5;entryX=0;entryY=0.5;${ends}` : `exitX=0;exitY=0.5;entryX=1;entryY=0.5;${ends}`;
    }
    doc.edge({ source: safe(e.from), target: safe(e.to), value: lb?.html ?? '', style, points, ...lab });
  }
  return doc;
}

// ---------------------------------------------------------------- activity diagram: lanes as columns
// The flow decides the rows: a node's row is the longest path to it from the initial node (flows back to an earlier
// node do not count). Each lane is a column; nodes of one lane on the same row sit side by side, the one with the longer
// flow after it keeping the column of the node before it. Every flow that ends gets its own final node, in its lane.
// Flows are routed on that grid: horizontal runs only in the gaps between rows, vertical runs only down a column that
// is empty on the way or in a gutter at the right of the lane, so no flow crosses a node.
function layoutActivity(model) {
  const finals = new Set(model.nodes.filter((n) => n.shape === 'final').map((n) => n.id));
  const nodes = model.nodes.filter((n) => !finals.has(n.id)).map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  model.edges.forEach((e, i) => {
    if (e.invisible) return;
    if (!finals.has(e.to)) {
      edges.push({ ...e });
      return;
    }
    const end = { id: `${e.to}_${i}`, shape: 'final', label: '', parent: byId.get(e.from)?.parent };
    nodes.push(end);
    byId.set(end.id, end);
    edges.push({ ...e, to: end.id });
  });
  const sizes = new Map(nodes.map((n) => [n.id, nodeBox(n, model)]));

  // Rows: depth-first from the initial node; flows back to a node still open are loops and do not count.
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from).push(e);
  const seen = new Map();
  const post = [];
  const back = new Set();
  const visit = (id) => {
    seen.set(id, 1);
    for (const e of out.get(id)) {
      if (seen.get(e.to) === 1) back.add(e);
      else if (!seen.has(e.to)) visit(e.to);
    }
    seen.set(id, 2);
    post.push(id);
  };
  for (const n of nodes) if (n.shape === 'initial' && !seen.has(n.id)) visit(n.id);
  for (const n of nodes) if (!seen.has(n.id)) visit(n.id);
  const fwd = edges.filter((e) => !back.has(e));
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  for (const id of [...post].reverse()) for (const e of fwd) if (e.from === id) rank.set(e.to, Math.max(rank.get(e.to), rank.get(id) + 1));
  const after = new Map(nodes.map((n) => [n.id, 0]));
  for (const id of post) for (const e of fwd) if (e.from === id) after.set(id, Math.max(after.get(id), after.get(e.to) + 1));
  const rows = Math.max(...rank.values()) + 1;

  // Columns inside each lane.
  const lanes = (model.groups ?? []).map((g) => ({ id: g.id, label: g.label ?? '' }));
  const laneIds = new Set(lanes.map((l) => l.id));
  if (nodes.some((n) => !laneIds.has(n.parent))) lanes.push({ id: '__other', label: '' });
  const laneOf = (id) => (laneIds.has(byId.get(id).parent) ? byId.get(id).parent : '__other');
  const laneById = new Map(lanes.map((l, i) => [l.id, Object.assign(l, { index: i, gutter: [] })]));
  const col = new Map();
  for (const lane of lanes) {
    const mine = nodes.filter((n) => laneOf(n.id) === lane.id);
    const byRow = new Map();
    for (const n of mine) byRow.set(rank.get(n.id), [...(byRow.get(rank.get(n.id)) ?? []), n]);
    for (const k of [...byRow.keys()].sort((a, b) => a - b)) {
      const taken = new Set();
      for (const n of byRow.get(k).sort((a, b) => after.get(b.id) - after.get(a.id))) {
        const p = fwd.find((e) => e.to === n.id && col.has(e.from) && laneOf(e.from) === lane.id);
        let c = p ? col.get(p.from) : 0;
        if (taken.has(c)) for (c = 0; taken.has(c);) c++;
        taken.add(c);
        col.set(n.id, c);
      }
    }
    lane.cols = Math.max(1, ...mine.map((n) => col.get(n.id) + 1));
    lane.colW = Math.max(150, ...mine.map((n) => sizes.get(n.id).w + 40));
  }
  const cell = new Map(nodes.map((n) => [`${laneOf(n.id)}|${col.get(n.id)}|${rank.get(n.id)}`, n.id]));
  const gcol = (id) => laneById.get(laneOf(id)).index * 1000 + col.get(id);
  // Is the column of node id empty from row r1 to row r2?
  const free = (id, r1, r2) => {
    for (let r = r1; r <= r2; r++) if (cell.has(`${laneOf(id)}|${col.get(id)}|${r}`)) return false;
    return true;
  };
  // Is the way along u's row, from u to the column of v, clear?
  const clear = (u, v) => {
    const [lo, hi] = [Math.min(gcol(u), gcol(v)), Math.max(gcol(u), gcol(v))];
    return !nodes.some((w) => w.id !== u && rank.get(w.id) === rank.get(u) && ((gcol(w.id) > lo && gcol(w.id) < hi) || gcol(w.id) === gcol(v)));
  };

  // Is row r clear between global columns a and b (a lane's gutter is column lane * 1000 + 500)?
  const rowClear = (r, a, b, except) => !nodes.some((w) => w.id !== except && rank.get(w.id) === r
    && gcol(w.id) > Math.min(a, b) && gcol(w.id) < Math.max(a, b));

  // Plans. A decision is left at the corner facing a branch when the way there and down is clear. A flow back to an
  // earlier node runs in the gutter of the target's lane, leaving and entering from the side when the row is clear.
  const plans = edges.map((e) => {
    const p = { e, u: e.from, v: e.to, ru: rank.get(e.from), rv: rank.get(e.to), start: 's' };
    if (back.has(e)) {
      p.kind = 'gutter';
      p.lane = laneOf(p.v);
    } else {
      const dx = gcol(p.v) - gcol(p.u);
      if (byId.get(p.u).shape === 'decision' && dx && clear(p.u, p.v) && free(p.v, p.ru + 1, p.rv - 1)) {
        p.start = dx < 0 ? 'w' : 'e';
        p.kind = 'corner';
      } else if (p.rv === p.ru + 1 || free(p.v, p.ru + 1, p.rv - 1)) p.kind = 'downAtV';
      else if (free(p.u, p.ru + 1, p.rv - 1)) p.kind = 'downAtU';
      else {
        p.kind = 'gutter';
        p.lane = laneOf(p.v);
      }
    }
    if (p.kind === 'gutter') {
      const gv = laneById.get(p.lane).index * 1000 + 500;
      p.sideOut = back.has(e) && rowClear(p.ru, gcol(p.u), gv, p.u);
      p.sideIn = back.has(e) && rowClear(p.rv, gcol(p.v), gv, p.v);
      // vertical extent in half rows: row r is 2r + 1, the gap under it 2r + 2
      const ends = [p.sideOut ? 2 * p.ru + 1 : 2 * p.ru + 2, p.sideIn ? 2 * p.rv + 1 : 2 * p.rv];
      const span = [Math.min(...ends), Math.max(...ends)];
      const lane = laneById.get(p.lane);
      let t = lane.gutter.findIndex((spans) => spans.every((s) => s[1] < span[0] || span[1] < s[0]));
      if (t < 0) t = lane.gutter.push([]) - 1;
      lane.gutter[t].push(span);
      p.track = t;
    }
    return p;
  });

  // x: lanes side by side, gutters at their right.
  let x = 0;
  for (const lane of lanes) {
    lane.x = x;
    const inner = 20 + lane.cols * lane.colW + (lane.gutter.length ? 8 + lane.gutter.length * 10 : 0);
    lane.w = Math.max(box(lane.label, 400, 40, 0).w, inner);
    x += lane.w;
  }
  const cx = (id) => {
    const l = laneById.get(laneOf(id));
    return l.x + 10 + col.get(id) * l.colW + l.colW / 2;
  };
  const gutterX = (p) => {
    const l = laneById.get(p.lane);
    return l.x + 10 + l.cols * l.colW + 8 + p.track * 10;
  };

  // Horizontal runs, gap by gap (gap r lies under row r; gap -1 above the first row); one track per run, runs
  // leaving the same node or arriving at the same node share theirs.
  const runs = new Map();
  const run = (p, gap, x1, x2, key) => {
    if (Math.abs(x1 - x2) < 0.5) return;
    if (!runs.has(gap)) runs.set(gap, new Map());
    const g = runs.get(gap);
    const k = g.get(key) ?? { lo: Infinity, hi: -Infinity, plans: [] };
    k.lo = Math.min(k.lo, x1, x2);
    k.hi = Math.max(k.hi, x1, x2);
    k.plans.push(p);
    g.set(key, k);
    (p.runs ??= []).push({ gap, key });
  };
  for (const p of plans) {
    if (p.kind === 'downAtV') run(p, p.ru, cx(p.u), cx(p.v), `u:${p.u}`);
    else if (p.kind === 'downAtU') run(p, p.rv - 1, cx(p.u), cx(p.v), `v:${p.v}`);
    else if (p.kind === 'gutter') {
      if (!p.sideOut) run(p, p.ru, cx(p.u), gutterX(p), `u:${p.u}`);
      if (!p.sideIn) run(p, p.rv - 1, gutterX(p), cx(p.v), `v:${p.v}`);
    }
  }
  const tracks = new Map();
  for (const [gap, g] of runs) {
    const used = [];
    for (const [key, k] of [...g.entries()].sort((a, b) => a[1].lo - b[1].lo)) {
      let t = used.findIndex((list) => list.every((o) => o.hi + 12 < k.lo || k.hi + 12 < o.lo));
      if (t < 0) t = used.push([]) - 1;
      used[t].push(k);
      tracks.set(`${gap}|${key}`, t);
    }
    tracks.set(gap, used.length);
  }

  // y: rows and gaps.
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(26, ...nodes.filter((n) => rank.get(n.id) === r).map((n) => sizes.get(n.id).h)));
  const gapH = (gap) => Math.max(gap < 0 ? 24 : 40, 26 + 10 * (tracks.get(gap) ?? 0));
  const rowY = [];
  const gapY = new Map();
  let y = 30;
  gapY.set(-1, y);
  y += gapH(-1);
  for (let r = 0; r < rows; r++) {
    rowY[r] = y;
    y += rowH[r];
    gapY.set(r, y);
    y += gapH(r);
  }
  const trackY = (gap, key) => gapY.get(gap) + (gapH(gap) - ((tracks.get(gap) ?? 1) - 1) * 10) / 2 + tracks.get(`${gap}|${key}`) * 10;
  const abs = new Map(nodes.map((n) => {
    const b = sizes.get(n.id);
    const r = rank.get(n.id);
    return [n.id, { x: cx(n.id) - b.w / 2, y: rowY[r] + (rowH[r] - b.h) / 2, w: b.w, h: b.h }];
  }));

  const doc = new Doc();
  for (const lane of lanes) doc.vertex({ id: safe(lane.id), value: htmlEsc(lane.label), style: S.lane, x: lane.x, y: 0, w: lane.w, h: y });
  for (const n of nodes) {
    const p = abs.get(n.id);
    const lane = laneById.get(laneOf(n.id));
    doc.vertex({ id: safe(n.id), value: sizes.get(n.id).html ?? '', style: styleOf(n, model), parent: safe(lane.id), x: p.x - lane.x, y: p.y, w: p.w, h: p.h });
  }
  for (const p of plans) {
    const a = abs.get(p.u);
    const b = abs.get(p.v);
    const ux = cx(p.u);
    const vx = cx(p.v);
    const gx = p.kind === 'gutter' ? gutterX(p) : 0;
    const side = (box, toward) => ({ x: toward > box.x + box.w / 2 ? box.x + box.w : box.x, y: box.y + box.h / 2 });
    const s = p.sideOut ? side(a, gx) : p.start === 's' ? { x: ux, y: a.y + a.h } : { x: p.start === 'w' ? a.x : a.x + a.w, y: a.y + a.h / 2 };
    const t = p.sideIn ? side(b, gx) : { x: vx, y: b.y };
    const ty = (k) => trackY(p.runs[k].gap, p.runs[k].key);
    let pts;
    if (p.kind === 'corner') pts = [s, { x: vx, y: s.y }, t];
    else if (p.kind === 'downAtV') pts = p.runs ? [s, { x: ux, y: ty(0) }, { x: vx, y: ty(0) }, t] : [s, t];
    else if (p.kind === 'downAtU') pts = p.runs ? [s, { x: ux, y: ty(0) }, { x: vx, y: ty(0) }, t] : [s, t];
    else {
      const y1 = p.sideOut ? s.y : trackY(p.ru, `u:${p.u}`);
      const y2 = p.sideIn ? t.y : trackY(p.rv - 1, `v:${p.v}`);
      pts = [s, ...(p.sideOut ? [] : [{ x: ux, y: y1 }]), { x: gx, y: y1 }, { x: gx, y: y2 }, ...(p.sideIn ? [] : [{ x: vx, y: y2 }]), t];
    }
    const lb = p.e.label ? box(p.e.label, 120, 8, 4) : null;
    let style = `edgeStyle=none;${EDGE}${ARROW.end}${p.e.dashed ? 'dashed=1;' : ''}`;
    style += constraint(pts[0], a, 'exit') + constraint(pts.at(-1), b, 'entry');
    let lab = {};
    if (lb) {
      const c = p.start === 's' ? { x: s.x + lb.w / 2 + 2, y: s.y + lb.h / 2 + 1 }
        : { x: s.x + (p.start === 'w' ? -1 : 1) * (lb.w / 2 + 4), y: s.y - lb.h / 2 - 1 };
      lab = labelAt(pts, c);
    }
    doc.edge({ source: safe(p.u), target: safe(p.v), value: lb?.html ?? '', style: `${style}${lb ? 'labelBackgroundColor=none;' : ''}`, points: pts.slice(1, -1), ...lab });
  }
  return doc;
}

// ---------------------------------------------------------------- ERD in Chen's notation
// Attributes sit in a row above and a row below each entity; relationships (diamonds) join entities through ports on
// the entity's left and right sides, one port per relationship, in the band between the two attribute rows (the box is
// made tall enough for them), so the orthogonal routes ELK computes neither cross the attributes nor merge into one
// line. A first layout decides the order of the ports along each side; the second keeps that order inside the band.
async function layoutChen(model) {
  const doc = new Doc();
  const options = rootOptions(model.dir ?? 'LR', { 'elk.layered.spacing.nodeNodeBetweenLayers': '40', 'elk.spacing.nodeNode': '24', 'elk.layered.spacing.edgeNodeBetweenLayers': '14', 'elk.spacing.edgeEdge': '10', 'elk.spacing.portPort': '12', 'elk.layered.thoroughness': '40' });
  const rels = model.relationships.map((rl, i) => ({ ...rl, rid: `rel${i}`, b: box(rl.label, 120, 44, 30) }));
  for (const rl of rels) {
    rl.b.w = Math.max(rl.b.w, 90);
    rl.b.h = Math.max(rl.b.h, 50);
  }
  // A relationship of an entity with itself: both lines leave the entity's right side for the diamond beside it.
  const self = (rl) => rl.from === rl.to;
  const info = new Map();
  for (const e of model.entities) {
    const eb = box(e.label, 200, 30, 20);
    const attrs = (e.attributes ?? []).map((a) => ({ ...a, b: box(a.name, 150, 24, 14) }));
    const half = Math.ceil(attrs.length / 2);
    const rows = [attrs.slice(0, half), attrs.slice(half)];
    const rowW = (row) => row.reduce((s, a) => s + a.b.w, 0) + Math.max(0, row.length - 1) * 8;
    const east = [...rels.filter((rl) => rl.from === e.id).map((rl) => `${rl.rid}:from`),
      ...rels.filter((rl) => rl.to === e.id && self(rl)).map((rl) => `${rl.rid}:to`)];
    const west = rels.filter((rl) => rl.to === e.id && !self(rl)).map((rl) => `${rl.rid}:to`);
    eb.h = Math.max(eb.h, 14 * Math.max(east.length, west.length) + 14);
    const w = Math.max(eb.w, rowW(rows[0]), rowW(rows[1])) + (attrs.length ? 8 : 0);
    const topH = rows[0].length ? 56 : 0;
    const botH = rows[1].length ? 56 : 0;
    info.set(e.id, { e, eb, rows, rowW, w, topH, botH, h: topH + eb.h + botH, east, west });
  }
  const port = (id, side, x, y) => ({ id, width: 1, height: 1, ...(x === undefined ? {} : { x, y }), layoutOptions: { 'elk.port.side': side } });
  const build = (fixed) => ({
    id: 'root',
    layoutOptions: options,
    children: [
      ...[...info].map(([id, f]) => {
        const ys = fixed.get(id);
        return {
          id,
          width: f.w,
          height: f.h,
          layoutOptions: { 'elk.portConstraints': ys ? 'FIXED_POS' : 'FIXED_SIDE' },
          ports: [...f.east.map((p) => port(p, 'EAST', ys && f.w - 1, ys?.get(p))), ...f.west.map((p) => port(p, 'WEST', ys && 0, ys?.get(p)))],
        };
      }),
      ...rels.map((rl) => ({
        id: rl.rid,
        width: rl.b.w,
        height: rl.b.h,
        layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
        ports: [port(`${rl.rid}:w`, 'WEST', 0, rl.b.h / 2), port(`${rl.rid}:e`, 'EAST', rl.b.w - 1, rl.b.h / 2)],
      })),
    ],
    edges: rels.flatMap((rl) => [
      { id: `${rl.rid}:a`, sources: [`${rl.rid}:from`], targets: [`${rl.rid}:w`] },
      self(rl) ? { id: `${rl.rid}:b`, sources: [`${rl.rid}:to`], targets: [`${rl.rid}:w`] }
        : { id: `${rl.rid}:b`, sources: [`${rl.rid}:e`], targets: [`${rl.rid}:to`] },
    ]),
  });
  const first = await elk.layout(build(new Map()));
  const fixed = new Map();
  for (const c of first.children) {
    const f = info.get(c.id);
    if (!f || !(f.topH || f.botH)) continue;
    const y = new Map(c.ports.map((p) => [p.id, p.y]));
    const ys = new Map();
    for (const list of [f.east, f.west]) {
      [...list].sort((p, q) => y.get(p) - y.get(q)).forEach((p, k) => ys.set(p, f.topH + (f.eb.h * (k + 1)) / (list.length + 1)));
    }
    fixed.set(c.id, ys);
  }
  const res = fixed.size ? await elk.layout(build(fixed)) : first;

  const pos = new Map(res.children.map((c) => [c.id, c]));
  const line = `edgeStyle=none;${EDGE}endArrow=none;`;
  const ent = new Map();
  for (const [id, f] of info) {
    const p = pos.get(id);
    const ex = p.x + (f.w - f.eb.w) / 2;
    const ey = p.y + f.topH;
    ent.set(id, { x: ex, y: ey, w: f.eb.w, h: f.eb.h, left: p.x, right: p.x + f.w });
    const eid = safe(id);
    doc.vertex({ id: eid, value: f.eb.html, style: f.e.external ? S.entityExt : S.entity, x: ex, y: ey, w: f.eb.w, h: f.eb.h });
    f.rows.forEach((row, k) => {
      let ax = p.x + (f.w - f.rowW(row)) / 2;
      for (const a of row) {
        const ay = k === 0 ? p.y : ey + f.eb.h + 56 - a.b.h;
        const aid = doc.vertex({ value: a.b.html, style: a.key ? S.keyAttribute : S.attribute, x: ax, y: ay, w: a.b.w, h: a.b.h });
        doc.edge({ source: aid, target: eid, style: line });
        ax += a.b.w + 8;
      }
    });
  }
  const edges = new Map(res.edges.map((e) => [e.id, e]));
  const card = `${line}fontStyle=1;fontSize=12;`;
  const corner = (side) => `${side}X=${side === 'exit' ? 1 : 0};${side}Y=0.5;${side}Dx=0;${side}Dy=0;${side}Perimeter=0;`;
  // Where a line meets the entity box: the port's height on the box side, plus the stretch from the box side out to
  // the port when the attribute rows make the shape wider than the box.
  const at = (pt, b, side) => {
    const x = side === 'exit' ? b.right : b.left;
    const edge = side === 'exit' ? b.x + b.w : b.x;
    const fy = Math.min(1, Math.max(0, (pt.y - b.y) / b.h));
    return {
      style: `${side}X=${side === 'exit' ? 1 : 0};${side}Y=${r(fy * 1000) / 1000};${side}Dx=0;${side}Dy=0;${side}Perimeter=0;`,
      extra: Math.abs(x - edge) > 0.5 ? [{ x, y: pt.y }] : [],
    };
  };
  for (const rl of rels) {
    const p = pos.get(rl.rid);
    const rid = doc.vertex({ id: safe(rl.rid), value: rl.b.html, style: S.relationship, x: p.x, y: p.y, w: rl.b.w, h: rl.b.h });
    const a = edges.get(`${rl.rid}:a`)?.sections?.[0];
    const b = edges.get(`${rl.rid}:b`)?.sections?.[0];
    const from = ent.get(rl.from);
    const to = ent.get(rl.to);
    // entity (right side) → diamond (left corner)
    const out = a ? at(a.startPoint, from, 'exit') : { style: corner('exit'), extra: [] };
    doc.edge({ source: safe(rl.from), target: rid, value: rl.fromCard, lx: 0.72, ly: -10,
      style: `${card}${out.style}${corner('entry')}`, points: a ? [...out.extra, ...(a.bendPoints ?? [])] : [] });
    if (self(rl)) {
      // second line of a relationship with itself: entity (right side) → diamond
      const out2 = b ? at(b.startPoint, to, 'exit') : { style: 'exitX=1;exitY=0.8;exitDx=0;exitDy=0;exitPerimeter=0;', extra: [] };
      doc.edge({ source: safe(rl.to), target: rid, value: rl.toCard, lx: 0.6, ly: 10, style: `${card}${out2.style}`, points: out2.extra });
      continue;
    }
    // diamond (right corner) → entity (left side)
    const inn = b ? at(b.endPoint, to, 'entry') : { style: corner('entry'), extra: [] };
    doc.edge({ source: rid, target: safe(rl.to), value: rl.toCard, lx: -0.72, ly: -10,
      style: `${card}${corner('exit')}${inn.style}`, points: b ? [...(b.bendPoints ?? []), ...inn.extra] : [] });
  }
  return doc;
}

// ---------------------------------------------------------------- sequence diagram
function layoutSequence(model) {
  const doc = new Doc();
  const ps = model.participants.map((p) => ({ ...p, b: box(p.label, 150, 24, 14) }));
  const idx = new Map(ps.map((p, i) => [p.id, i]));
  const gaps = ps.slice(1).map((p, i) => ps[i].b.w / 2 + p.b.w / 2 + 30);
  const msgs = model.items.filter((it) => it.type === 'msg');
  let n = 0;
  for (const m of msgs) {
    n += 1;
    m.text = model.autonumber ? `${n}. ${m.text}` : m.text;
    const a = idx.get(m.from);
    const b = idx.get(m.to);
    if (a === b) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    m.b = box(m.text, Math.min(320, Math.max(150, 130 * (hi - lo))), 10, 0);
    const need = (m.b.w + 30) / (hi - lo);
    for (let k = lo; k < hi; k++) gaps[k] = Math.max(gaps[k], need);
  }
  const xs = [ps[0].b.w / 2 + 20];
  gaps.forEach((g, k) => xs.push(xs[k] + g));
  let y = 70;
  const frames = [];
  const layout = [];
  for (const it of model.items) {
    if (it.type === 'msg') {
      const a = idx.get(it.from);
      const b = idx.get(it.to);
      if (a === b) {
        it.b = box(it.text, 220, 10, 0);
        y += it.b.h + 4;
        layout.push({ it, y, self: true });
        y += 34;
      } else {
        y += it.b.h + 2;
        layout.push({ it, y });
        y += 14;
      }
      for (const f of frames) f.parts.add(a).add(b);
    } else if (it.type === 'start') {
      y += 8;
      frames.push({ ...it, top: y, parts: new Set(), elses: [], depth: frames.length });
      y += 34;
    } else if (it.type === 'else') {
      frames.at(-1).elses.push({ y: y + 6, label: it.label });
      y += 30;
    } else if (it.type === 'end') {
      const f = frames.pop();
      f.bottom = y + 6;
      layout.push({ frame: f });
      for (const g of frames) for (const p of f.parts) g.parts.add(p);
      y += 16;
    } else if (it.type === 'note') {
      const nb = box(it.text, 220, 16, 10);
      layout.push({ note: it, y: y + 6, nb });
      y += nb.h + 16;
    }
  }
  const height = y + 30;
  ps.forEach((p, i) => {
    const w = Math.max(p.b.w, 90);
    doc.vertex({ id: safe(p.id), value: p.b.html, style: p.actor ? S.actorLifeline : S.lifeline, x: xs[i] - w / 2, y: 0, w, h: height });
  });
  for (const l of layout) {
    if (l.frame) {
      const f = l.frame;
      const parts = [...f.parts].sort((a, b) => a - b);
      const x0 = xs[parts[0]] - ps[parts[0]].b.w / 2 - 14 + f.depth * 6;
      const x1 = xs[parts.at(-1)] + ps[parts.at(-1)].b.w / 2 + 14 - f.depth * 6;
      doc.vertex({ value: f.kind, style: S.frame, x: x0, y: f.top, w: x1 - x0, h: f.bottom - f.top });
      doc.vertex({ value: htmlEsc(`[${f.label}]`), style: S.text, x: x0 + 60, y: f.top + 2, w: Math.min(x1 - x0 - 64, tw(f.label) + 30), h: 20 });
      for (const el of f.elses) {
        doc.edge({ style: `${EDGE}endArrow=none;dashed=1;strokeColor=#666666;`, sourcePoint: { x: x0, y: el.y }, targetPoint: { x: x1, y: el.y } });
        doc.vertex({ value: htmlEsc(`[${el.label}]`), style: S.text, x: x0 + 6, y: el.y + 2, w: tw(el.label) + 30, h: 20 });
      }
      continue;
    }
    if (l.note) {
      const ids = l.note.over.map((o) => idx.get(o));
      const cx = (xs[Math.min(...ids)] + xs[Math.max(...ids)]) / 2;
      doc.vertex({ value: l.nb.html, style: S.note, x: cx - l.nb.w / 2, y: l.y, w: l.nb.w, h: l.nb.h });
      continue;
    }
    const m = l.it;
    const a = xs[idx.get(m.from)];
    const b = xs[idx.get(m.to)];
    const st = `${EDGE}verticalAlign=bottom;${m.dashed ? 'dashed=1;endArrow=open;endFill=0;endSize=8;' : 'endArrow=block;endFill=1;endSize=8;'}`;
    if (l.self) {
      doc.edge({ style: `${st}align=left;spacingLeft=4;`, value: m.b.html, sourcePoint: { x: a, y: l.y }, targetPoint: { x: a + 2, y: l.y + 24 }, points: [{ x: a + 40, y: l.y }, { x: a + 40, y: l.y + 24 }], lx: -0.6, offset: { x: 30, y: 0 } });
    } else {
      doc.edge({ style: st, value: m.b.html, sourcePoint: { x: a, y: l.y }, targetPoint: { x: b, y: l.y } });
    }
  }
  return doc;
}

// ---------------------------------------------------------------- export with draw.io
function turnIfWide(canvas) {
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const upright = Math.min(16 / w, 23 / h);
  if ((14 * upright) / 0.0353 >= 6.5 || Math.min(23 / w, 16 / h) <= 1.25 * upright) return null;
  const rc = document.createElement('canvas');
  rc.width = canvas.height;
  rc.height = canvas.width;
  const g = rc.getContext('2d');
  g.translate(0, rc.height);
  g.rotate(-Math.PI / 2);
  g.drawImage(canvas, 0, 0);
  return rc;
}
const toBlob = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));
async function exportAll(files) {
  const frame = document.createElement('iframe');
  frame.src = 'https://embed.diagrams.net/?embed=1&proto=json&spin=0&noSaveBtn=1&noExitBtn=1&ui=min';
  frame.style.cssText = 'width:1100px;height:750px;border:1px solid #ccc';
  document.body.append(frame);
  const waitFor = (ev) => new Promise((ok) => {
    const h = (m) => {
      if (m.source !== frame.contentWindow) return;
      let d;
      try {
        d = JSON.parse(m.data);
      } catch {
        return;
      }
      if (d.event === ev) {
        window.removeEventListener('message', h);
        ok(d);
      }
    };
    window.addEventListener('message', h);
  });
  await waitFor('init');
  let failed = 0;
  for (const f of files) {
    try {
      frame.contentWindow.postMessage(JSON.stringify({ action: 'load', xml: f.xml, autosave: 0 }), '*');
      await waitFor('load');
      // draw.io ignores an export asked for right after the load: ask again until it answers.
      let d = null;
      for (let attempt = 0; attempt < 6 && !d; attempt++) {
        await new Promise((ok) => setTimeout(ok, 700));
        const answer = waitFor('export');
        frame.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'png', scale: 2, border: 16 }), '*');
        d = await Promise.race([answer, new Promise((ok) => setTimeout(() => ok(null), 6000))]);
      }
      if (!d) throw new Error('draw.io did not export');
      const img = new Image();
      img.src = d.data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0);
      await fetch(`/save?name=${encodeURIComponent(f.name)}&ext=png`, { method: 'POST', body: await toBlob(c) });
      const rc = turnIfWide(c);
      if (rc) await fetch(`/save?name=${encodeURIComponent(f.name)}-r&ext=png`, { method: 'POST', body: await toBlob(rc) });
      log(`exported ${f.name} ${c.width}x${c.height}${rc ? ' (+turned)' : ''}`);
    } catch (e) {
      failed++;
      log(`FAIL ${f.name}: ${e.message || e}`);
    }
  }
  return failed;
}

// ---------------------------------------------------------------- driver
(async () => {
  const job = await (await fetch('/job')).json();
  let failed = 0;
  if (job.mode === 'layout') {
    for (const m of job.models) {
      try {
        const doc = m.kind === 'chen' ? await layoutChen(m)
          : m.kind === 'sequence' ? layoutSequence(m)
            : m.kind === 'activity' ? await layoutActivity(m)
              : m.kind === 'usecase' ? layoutUseCase(m)
                : await layoutGraph(m);
        await fetch(`/save?name=${encodeURIComponent(m.name)}&ext=drawio`, { method: 'POST', body: doc.xml(m.title ?? m.name) });
        log(`ok ${m.name}`);
      } catch (e) {
        failed++;
        log(`FAIL ${m.name}: ${e.message || e}`);
      }
    }
  } else {
    failed = await exportAll(job.files);
  }
  await fetch(`/done?failed=${failed}`, { method: 'POST' });
  log('done');
})();
