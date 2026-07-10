import { createFileRoute, redirect } from "@tanstack/react-router";

// Demo analysis został wyłączony jako główny flow.
// Real Frame Analyzer zastępuje fałszywą analizę AI.
export const Route = createFileRoute("/vision-lab/test/$testId/analysis")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/vision-lab/frame-analyzer/$testId",
      params: { testId: params.testId },
    });
  },
});
