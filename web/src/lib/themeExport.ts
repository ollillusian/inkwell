import type { ThemeTimelineStep } from "@/lib/themeTimeline";

/** Topic × frame matrix for research export. */
export function buildThemeMatrixCsv(steps: ThemeTimelineStep[]): string {
  const topicIds = new Set<string>();
  const topicLabels = new Map<string, string>();

  for (const s of steps) {
    for (const n of s.graph.nodes) {
      if (n.kind !== "topic") continue;
      topicIds.add(n.id);
      topicLabels.set(n.id, n.label);
    }
  }

  const ids = [...topicIds].sort((a, b) =>
    (topicLabels.get(a) ?? a).localeCompare(topicLabels.get(b) ?? b)
  );

  const header = [
    "topic_id",
    "topic_label",
    ...steps.map((s) => `${s.granularity}:${s.dateKey}`),
  ];

  const rows = ids.map((id) => {
    const weights = steps.map((s) => {
      const n = s.graph.nodes.find((x) => x.id === id);
      return n ? String(n.weight) : "0";
    });
    return [id, topicLabels.get(id) ?? id, ...weights];
  });

  const escape = (cell: string) => {
    if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };

  return [header, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvgElement(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(clone);
  downloadTextFile(filename, source, "image/svg+xml");
}

/** Rasterize SVG to PNG via canvas (browser only). */
export async function downloadSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const { width, height } = svg.getBoundingClientRect();
  const w = Math.max(width, 720);
  const h = Math.max(height, 540);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const source = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.scale(scale, scale);
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--ink-bg")
        .trim() || "#faf8f5";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG export failed"));
          return;
        }
        const obj = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = obj;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(obj);
        resolve();
      }, "image/png");
    };
    img.onerror = () => reject(new Error("SVG rasterize failed"));
    img.src = url;
  });
}
