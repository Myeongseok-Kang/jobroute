const MAX_CHARS = 15000;

export function buildEmbeddingText(job: {
  title: string;
  company: string;
  mainTasks: string | null;
  requirements: string | null;
  preferredPoints: string | null;
  rawText: string;
}): string {
  const structured = [job.mainTasks, job.requirements, job.preferredPoints]
    .filter(Boolean)
    .join('\n\n');

  const bodyText = structured.length > 0 ? structured : job.rawText;
  const text = [job.title, job.company, bodyText].filter(Boolean).join('\n\n');

  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}