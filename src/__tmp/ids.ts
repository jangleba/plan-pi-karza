import { getApprovedExerciseDefinitions } from "../lib/loadwise/exerciseLibrary";
console.log(getApprovedExerciseDefinitions().map(e=>`${e.id} | ${e.displayNamePl ?? e.displayName}`).join("\n"));
