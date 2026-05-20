export type SimpleEdge = { source: string; target: string; weight: number };

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple force-directed layout: open field, no ring constraint. */
export function runForceDirectedLayout<
  T extends { id: string; kind: string; x: number; y: number },
>(nodes: T[], edges: SimpleEdge[], width: number, height: number, seed = 1): T[] {
  const rand = mulberry32(seed);
  const cx = width / 2;
  const cy = height / 2;

  type Sim = T & { vx: number; vy: number };
  const pos: Sim[] = nodes.map((n) => ({
    ...n,
    x: cx + (rand() - 0.5) * width * 0.55,
    y: cy + (rand() - 0.5) * height * 0.55,
    vx: 0,
    vy: 0,
  }));

  const edgeList = edges.map((e) => ({
    s: e.source,
    t: e.target,
    w: Math.max(e.weight, 0.5),
  }));

  const idIndex = new Map(pos.map((p, i) => [p.id, i]));

  const mass = (k: string) => {
    const n = pos[idIndex.get(k)!];
    if (!n) return 1;
    if (n.kind === "moment") return 0.85;
    if (n.kind === "signal") return 0.7;
    return 1.15;
  };

  const idealLen = (w: number) => 52 + 38 / Math.sqrt(w);

  const iterations = 140;
  const dt = 0.18;
  const damping = 0.88;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = pos.map(() => ({ fx: 0, fy: 0 }));

    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let dx = pos[j]!.x - pos[i]!.x;
        let dy = pos[j]!.y - pos[i]!.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minD =
          pos[i]!.kind === "signal" || pos[j]!.kind === "signal" ? 36 : 48;
        const kRep = 5200;
        const f = kRep / (dist * dist);
        dx /= dist;
        dy /= dist;
        forces[i]!.fx -= dx * f;
        forces[i]!.fy -= dy * f;
        forces[j]!.fx += dx * f;
        forces[j]!.fy += dy * f;
        if (dist < minD) {
          const push = (minD - dist) * 0.04;
          forces[i]!.fx -= dx * push;
          forces[i]!.fy -= dy * push;
          forces[j]!.fx += dx * push;
          forces[j]!.fy += dy * push;
        }
      }
    }

    for (const e of edgeList) {
      const i = idIndex.get(e.s);
      const j = idIndex.get(e.t);
      if (i === undefined || j === undefined) continue;
      const a = pos[i]!;
      const b = pos[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const target = idealLen(e.w);
      const diff = dist - target;
      const kSpring = 0.022 * Math.sqrt(e.w);
      const f = kSpring * diff;
      dx /= dist;
      dy /= dist;
      forces[i]!.fx += dx * f;
      forces[i]!.fy += dy * f;
      forces[j]!.fx -= dx * f;
      forces[j]!.fy -= dy * f;
    }

    const kG = 0.0009;
    for (let i = 0; i < pos.length; i++) {
      forces[i]!.fx -= (pos[i]!.x - cx) * kG * mass(pos[i]!.id);
      forces[i]!.fy -= (pos[i]!.y - cy) * kG * mass(pos[i]!.id);
    }

    for (let i = 0; i < pos.length; i++) {
      pos[i]!.vx = (pos[i]!.vx + forces[i]!.fx * dt) * damping;
      pos[i]!.vy = (pos[i]!.vy + forces[i]!.fy * dt) * damping;
      pos[i]!.x += pos[i]!.vx * dt;
      pos[i]!.y += pos[i]!.vy * dt;
    }
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 56;
  const spanX = Math.max(maxX - minX, 120);
  const spanY = Math.max(maxY - minY, 120);
  const scale = Math.min(
    (width - 2 * pad) / spanX,
    (height - 2 * pad) / spanY,
    1.35
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return pos.map((p) => {
    const { vx, vy, ...rest } = p;
    return {
      ...rest,
      x: cx + (p.x - midX) * scale,
      y: cy + (p.y - midY) * scale,
    } as unknown as T;
  });
}
