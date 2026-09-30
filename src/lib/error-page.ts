export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>Nie udało się wczytać strony</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face { font-family: "Source Sans 3"; font-style: normal; font-weight: 200 900; font-display: swap; src: url("/fonts/source-sans-3-upright.woff2") format("woff2"); }
      * { box-sizing: border-box; }
      body { font: 16px/1.5 "Source Sans 3", system-ui, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; }
      main { max-width: 28rem; width: 100%; }
      h1 { font-size: 1.75rem; line-height: 1.2; font-weight: 600; margin: 0 0 1rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
      a, button { display: inline-flex; min-height: 3rem; align-items: center; justify-content: center; padding: 0.625rem 1rem; border-radius: 0.5rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      a:focus-visible, button:focus-visible { outline: 2px solid #111; outline-offset: 3px; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
      @media (max-width: 30rem) { .actions { flex-direction: column; } }
      @media (min-width: 64rem) { h1 { font-size: 2rem; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Nie udało się wczytać strony</h1>
      <p>Coś poszło nie tak. Spróbuj ponownie albo wróć na stronę startową.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Spróbuj ponownie</button>
        <a class="secondary" href="/">Wróć na start</a>
      </div>
    </main>
  </body>
</html>`;
}
