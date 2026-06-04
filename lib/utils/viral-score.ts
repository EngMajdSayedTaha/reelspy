export function calculateViralScore(params: {
  likes: number;
  comments: number;
  views: number;
}): number {
  const { likes, comments, views } = params;
  return likes * 1.0 + comments * 3.0 + views * 0.01;
}
