import "@/styles/ballwise-plan.css";
import { MasTestAction } from "@/components/loadwise/MasTestAction";
import { masTestIneligibility } from "@/lib/loadwise/engineV2/masTestRecipe";
import { useLoadwise } from "@/lib/loadwise/store";

/**
 * Postęp → Testy. The only fitness test of the weekly engine: the 5-minute run that gives a
 * field estimate of MAS. Proposing it replaces one unstarted calm run; nothing changes until
 * the athlete applies the proposal.
 */
export function ProgressTests() {
  const { state, todayIso } = useLoadwise();
  const reason = state.profile
    ? masTestIneligibility(state.profile, todayIso)
    : "Uzupełnij profil, aby zaplanować test.";
  return (
    <section className="bw-progress-tests" aria-labelledby="progress-tests-title">
      <h2 id="progress-tests-title">Test biegowy 5 minut</h2>
      <p>
        Biegnij 5 minut jak najdalej po płaskiej, odmierzonej trasie. Z dystansu powstaje terenowe
        oszacowanie MAS i tempa biegów w planie. To nie jest pomiar VO₂max.
      </p>
      {reason ? (
        <p role="status" className="bw-progress-tests-note">
          {reason}
        </p>
      ) : !state.plan.length ? (
        <p role="status" className="bw-progress-tests-note">
          Zapisz plan w zakładce Plan; test zastąpi w nim jeden spokojny bieg.
        </p>
      ) : (
        <MasTestAction />
      )}
      <p className="bw-progress-tests-fine">
        Propozycja zastępuje jeden nierozpoczęty spokojny bieg. Plan zmienia się dopiero po
        zatwierdzeniu.
      </p>
    </section>
  );
}
