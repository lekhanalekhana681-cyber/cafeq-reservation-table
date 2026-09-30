export function renderErrorPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>500 - Server Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fdfbf7; color: #2c221e; }
    .box { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 3rem; margin-bottom: 0.5rem; }
    p { color: #786c65; margin-bottom: 1.5rem; }
    a { display: inline-block; padding: 0.5rem 1rem; background: #5c3826; color: #fff; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>500</h1>
    <p>Something went wrong on our end. Please try again later.</p>
    <a href="/">Return Home</a>
  </div>
</body>
</html>`;
}
