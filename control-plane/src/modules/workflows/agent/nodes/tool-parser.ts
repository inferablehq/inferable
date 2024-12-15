import skmeans from "skmeans";

export function mostRelevantKMeansCluster<T extends { similarity: number }>(
  tools: T[],
): T[] {
  const min = Math.min(...tools.map((t) => t.similarity));
  const max = Math.max(...tools.map((t) => t.similarity));

  const p50 = max * 0.5;

  const clusters = skmeans(
    tools.map((t) => t.similarity),
    3,
    [max, p50, min],
  );

  return tools.filter((t, idx) => {
    return clusters.idxs[idx] === 0;
  });
}
