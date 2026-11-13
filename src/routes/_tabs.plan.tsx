import { createFileRoute } from "@tanstack/react-router";
import { PlanScreen } from "@/components/loadwise/TrainingPlanScreen";

export const Route = createFileRoute("/_tabs/plan")({ component: PlanScreen });
