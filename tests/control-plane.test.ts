import test from "node:test";
import assert from "node:assert/strict";
import { CORE_CAPABILITIES } from "../src/control-plane/contracts.ts";
import { runSafeRecovery, selectCapabilities } from "../src/control-plane/recovery.ts";
test("router selects only requested capabilities", () => { const selected = selectCapabilities({ project: "techcriptoai", task: "health", requiredCapabilities: ["market-data-read", "evidence-reporting"], risk: "P2" }, CORE_CAPABILITIES); assert.deepEqual(selected, ["market-data-read", "evidence-reporting"]); });
test("recovery never authorizes production writes", async () => { const result = await runSafeRecovery({ project: "techcriptoai", task: "deploy", requiredCapabilities: ["evidence-reporting"], risk: "P0", productionWriteRequested: true }, CORE_CAPABILITIES, []); assert.equal(result.status, "BLOCKED"); assert.equal(result.productionWriteAllowed, false); });
