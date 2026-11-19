export interface PastEdition {
  year: number;
  edition: string;
  desc: string;
}

export const EDITIONS: PastEdition[] = [
  { year: 2021, edition: "Edition I", desc: "First edition launches in Sagamu. The Adewale STEM Contest is born." },
  { year: 2022, edition: "Edition II", desc: "Expanded across Ogun State. Innovation pitch category introduced." },
  { year: 2023, edition: "Edition III", desc: "Grand Finale camping format debuts. 300 students, 700 day-visitors." },
  { year: 2024, edition: "Edition IV", desc: "Cumulative scholarship support crosses ₦25 million. 5,000 students reached." },
  { year: 2025, edition: "Edition V", desc: "Fifth consecutive edition. Programme announces institutionalisation under OEIC." },
  { year: 2026, edition: "Edition VI", desc: "The camp and the Grand Finale in Abeokuta are streamed live for the first time." },
];
