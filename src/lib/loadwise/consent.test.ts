// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { recordConsentDecisions } from "./consent";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), clear: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./legalStatus", () => ({ clearConsentStatusCache: mocks.clear }));
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { updated_at: "new" }, error: null });
});
it("persists decisions sequentially with revisions and sends one notification for the entire batch", async () => {
  const notify = vi.fn();
  window.addEventListener("ballwise:consent-changed", notify);
  try {
    await recordConsentDecisions(
      [
        { type: "terms", accepted: true },
        { type: "privacy", accepted: true },
        { type: "health_data", accepted: false },
      ],
      "old",
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc.mock.calls[0][1].p_expected_profile_updated_at).toBe("old");
    expect(mocks.rpc.mock.calls[1][1].p_expected_profile_updated_at).toBe("new");
  } finally {
    window.removeEventListener("ballwise:consent-changed", notify);
  }
});
it("lets the encompassing onboarding command suppress mid-write hydration notifications", async () => {
  const notify = vi.fn();
  window.addEventListener("ballwise:consent-changed", notify);
  try {
    await recordConsentDecisions(
      [
        { type: "terms", accepted: true },
        { type: "privacy", accepted: true },
      ],
      null,
      { notify: false },
    );
    expect(notify).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener("ballwise:consent-changed", notify);
  }
});

it("reports confirmed checkpoints so a partially failed batch can resume with the last acknowledged revision",async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{updated_at:"one"},error:null}).mockResolvedValueOnce({data:null,error:{message:"timeout"}});
 const checkpoint=vi.fn();const decisions=[{type:"terms" as const,accepted:true},{type:"privacy" as const,accepted:true}];
 await expect(recordConsentDecisions(decisions,"zero",{notify:false,onAcknowledged:checkpoint})).rejects.toThrow("timeout");
 expect(checkpoint).toHaveBeenCalledExactlyOnceWith(1,"one");
 await recordConsentDecisions(decisions,"one",{notify:false,fromIndex:1});expect(mocks.rpc.mock.calls[2][1].p_consent_type).toBe("privacy");expect(mocks.rpc.mock.calls[2][1].p_expected_profile_updated_at).toBe("one");
});
