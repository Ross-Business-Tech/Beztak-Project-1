# Turning on AI answers in Ops Help

Ops Help is ready for an AI model. Until a key is added, it answers with its built-in manual search, and the page says "Search mode (AI not connected)".

## For the instructor: add the key in here.now

The key is stored in here.now, never in this repository. Add **one** of these variables, depending on which key you have, on **both** the team workspace (public site) and the account that hosts the dev sites:

| Key you have | Variable name to create | Pin it to host |
|---|---|---|
| Anthropic (Claude API) key | `ANTHROPIC_API_KEY` | `api.anthropic.com` |
| OpenRouter key | `OPENROUTER_API_KEY` | `openrouter.ai` |

The site's proxy routes are in `public/.herenow/proxy.json`: `/api/ai/anthropic` and `/api/ai/openrouter`. here.now adds the key on its servers when the app calls those paths.

## For the team: one setting to check

In `src/ai.js`, `AI_CONFIG.provider` must match the key: `'anthropic'` (the current setting) or `'openrouter'`. If you use OpenRouter, confirm the model name in `AI_CONFIG.models.openrouter` on openrouter.ai/models. Then rebuild and republish.

## How it works

1. An employee asks a question. Safety checks run first in the browser. Crisis messages are never sent to the AI.
2. The app sends the question, the recent conversation, and the **whole Operations Manual** to the AI through the proxy route.
3. The AI answers only from the manual and cites sections like [§6.3]. The app shows the original text of each cited section under "Cited sections".
4. If the AI can't be reached (no key, rate limit, timeout), the app falls back to the manual search automatically.

Limits to know: here.now proxy routes allow about 100 requests per hour per visitor by default. AI answers only work on signed-in previews and the team's sites, not on anonymous 24-hour links.
