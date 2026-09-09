import { defineMcp } from "@lovable.dev/mcp-js";
import recommendDay from "./tools/recommend-day";
import listSessionTypes from "./tools/list-session-types";
import weeklyPlanShape from "./tools/weekly-plan-shape";

export default defineMcp({
  name: "loadwise-mcp",
  title: "Loadwise MCP",
  version: "0.1.0",
  instructions:
    "Narzędzia silnika decyzyjnego Loadwise dla piłkarzy. Użyj `recommend_day_pattern`, aby dobrać typ dnia treningowego wg relacji do meczu, celu i gotowości; `weekly_plan_shape`, aby wyliczyć minimalne wymagania tygodnia; `list_session_types`, aby przejrzeć bibliotekę sesji.",
  tools: [recommendDay, weeklyPlanShape, listSessionTypes],
});
