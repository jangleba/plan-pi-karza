/** Unit and SQL-harness tests must never use a hosted project by accident.
 * Tests that exercise networking install their own explicit fetch mock. */
globalThis.fetch = async () => {
  throw new Error(
    "Unexpected network call in unit test: mock the service or use the local database harness.",
  );
};
