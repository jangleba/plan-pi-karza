import { FootballIQMatch } from "../features/football-iq-match";

export default function FootballIQMatchDemo() {
  return (
    <FootballIQMatch
      showOnboardingInitially
      onBack={() => window.history.back()}
      onComplete={(result) => console.info("Football IQ result", result)}
    />
  );
}
