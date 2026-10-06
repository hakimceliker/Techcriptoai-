import type { Capability, ControlRequest, ControlResult, Evidence } from "./contracts.ts";
export type RecoveryStep = { name: string; run: () => Promise<{ ok: boolean; evidence?: Evidence }> };
export function selectCapabilities(request: ControlRequest, registry: Capability[]): string[] { return [...new Set(registry.filter((x) => request.requiredCapabilities.includes(x.id)).sort((a,b) => a.costRank-b.costRank).map((x) => x.id))]; }
export async function runSafeRecovery(request: ControlRequest, registry: Capability[], steps: RecoveryStep[]): Promise<ControlResult> {
  const selectedCapabilities = selectCapabilities(request, registry); const attempts: string[] = []; const evidence: Evidence[] = [];
  if (request.productionWriteRequested) return { status: "BLOCKED", risk: request.risk, selectedCapabilities, evidence, attempts: ["production-write blocked by policy"], nextAction: "İnsan onayı gerekir; otomatik üretim değişikliği yapılmadı.", productionWriteAllowed: false };
  for (const step of steps) { attempts.push(step.name); try { const result = await step.run(); if (result.evidence) evidence.push(result.evidence); if (result.ok) return { status: "RECOVERED", risk: request.risk, selectedCapabilities, evidence, attempts, nextAction: "İzlemeye devam et; canlı emir yolu kapalı.", productionWriteAllowed: false }; } catch (error) { attempts.push(`${step.name}: ${error instanceof Error ? error.message : "unknown error"}`); } }
  return { status: "BLOCKED", risk: request.risk, selectedCapabilities, evidence, attempts, nextAction: "Mevcut hata raporunu gönder; paper/gölge analiz dışında işlem yapma.", productionWriteAllowed: false };
}
