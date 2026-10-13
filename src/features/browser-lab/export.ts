import { validatedResult, type BrowserResult } from "./results";
const cell = (value: unknown) => {
  let text = String(value ?? "");
  // Prevent spreadsheet formulas when a note or filename starts with a formula token.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export function historyCSV(input: readonly BrowserResult[]) {
  const columns = [
    "id",
    "sessionId",
    "recordedAt",
    "testId",
    "side",
    "trial",
    "primaryValue",
    "primaryUnit",
    "elapsedSeconds",
    "fps",
    "startFrameIndex",
    "endFrameIndex",
    "startSeconds",
    "endSeconds",
    "resolutionMin",
    "resolutionMax",
    "averageSpeedMps",
    "spatial",
    "turnFrameIndex",
    "turnSeconds",
    "version",
    "sourceName",
    "sourceHash",
    "notes",
  ] as const;
  return (
    "\uFEFF" +
    [
      columns.map(cell).join(";"),
      ...input
        .map(validatedResult)
        .map((row) =>
          columns
            .map((key) =>
              cell(key === "spatial" && row.spatial ? JSON.stringify(row.spatial) : row[key]),
            )
            .join(";"),
        ),
    ].join("\r\n")
  );
}
