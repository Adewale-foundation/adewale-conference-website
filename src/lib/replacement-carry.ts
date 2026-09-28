// Does an outgoing rep hold an exam identity that the rep replacing them could
// take over? Split out of the replacements page so the rule — this edition's
// exam only — is testable; the page does the reads.

export type CarryExam = {
  id: string;
  title: string;
  edition_year: number;
  item_count: number;
};

export type CarryCandidate = { exam_id: string; exam_no: string };

export type CarryPaper = {
  exam_id: string;
  total: number | null;
  name_mismatch: boolean;
};

export type ExamCarryOver = {
  examId: string;
  examTitle: string;
  examNo: string;
  /** null when a sheet was printed but none has been captured yet. */
  total: number | null;
  outOf: number;
  /** The sheet's bubbled number matched but its written name did not — direct
   *  evidence that someone else sat on this number. */
  nameMismatch: boolean;
};

/**
 * The candidate row is the authority on who was issued which number, so it —
 * not the marked sheet — decides whether there is anything to carry: a rep
 * whose sheet is still waiting on an import has a number that must move too,
 * or the sheet lands back on the retired row when it arrives.
 *
 * Past editions are never offered. A replacement is scoped to the registration
 * it was filed against, and last year's result belongs to whoever earned it.
 */
export function examCarryOver(
  exams: CarryExam[],
  candidates: CarryCandidate[],
  papers: CarryPaper[],
  editionYear: number | null,
): ExamCarryOver | null {
  if (editionYear === null) return null;

  const thisEdition = new Map(
    exams.filter((e) => e.edition_year === editionYear).map((e) => [e.id, e]),
  );
  const held = candidates.filter((c) => thisEdition.has(c.exam_id));
  if (held.length === 0) return null;

  // More than one sitting in a year is possible; the one with a captured sheet
  // is the one the school is arguing about.
  const scored = new Set(papers.map((p) => p.exam_id));
  const pick = held.find((c) => scored.has(c.exam_id)) ?? held[0];
  const exam = thisEdition.get(pick.exam_id) as CarryExam;
  const paper = papers.find((p) => p.exam_id === pick.exam_id) ?? null;

  return {
    examId: exam.id,
    examTitle: exam.title,
    examNo: pick.exam_no,
    total: paper?.total ?? null,
    outOf: exam.item_count,
    nameMismatch: paper?.name_mismatch ?? false,
  };
}
