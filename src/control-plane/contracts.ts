export type ControlStatus = "PASS" | "RECOVERED" | "PARTIAL" | "BLOCKED" | "NO_TRADE";
export type RiskLevel = "P0" | "P1" | "P2" | "P3";
export type Capability = { id: string; description: string; risk: RiskLevel; readOnly: boolean; costRank: number };
export type ControlRequest = { project: "mouseai" | "letfon-ai" | "stechai" | "techcriptoai"; task: string; requiredCapabilities: string[]; risk: RiskLevel; productionWriteRequested?: boolean };
export type Evidence = { name: string; value: string; timestampMs: number };
export type ControlResult = { status: ControlStatus; risk: RiskLevel; selectedCapabilities: string[]; evidence: Evidence[]; attempts: string[]; nextAction: string; productionWriteAllowed: false };
export const CORE_CAPABILITIES: Capability[] = [
  { id: "market-data-read", description: "Salt-okunur piyasa verisi", risk: "P2", readOnly: true, costRank: 1 },
  { id: "signal-analysis", description: "Paper/gölge sinyal analizi", risk: "P2", readOnly: true, costRank: 1 },
  { id: "incident-diagnosis", description: "Hata ve olay teşhisi", risk: "P1", readOnly: true, costRank: 1 },
  { id: "recovery-retry", description: "Güvenli retry ve fallback", risk: "P1", readOnly: true, costRank: 1 },
  { id: "evidence-reporting", description: "Kanıtlı raporlama", risk: "P2", readOnly: true, costRank: 1 },
];
