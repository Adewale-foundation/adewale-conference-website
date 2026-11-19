/** The parts of the Network Information API we read. Chromium only; Safari and Firefox have none. */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
}

/** Whether to fetch imagery the page reads fine without. An unknown connection counts as able. */
export function canAffordImagery(connection: ConnectionHint | null | undefined): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}
