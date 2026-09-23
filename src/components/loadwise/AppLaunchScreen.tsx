export function AppLaunchScreen() {
  return (
    <div
      className="app-shell bw-launch"
      aria-busy="true"
      aria-label="Ładowanie aplikacji BallWise"
    >
      <span className="bw-launch__signal" aria-hidden="true" />
    </div>
  );
}
