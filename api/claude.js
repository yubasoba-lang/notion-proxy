export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    // Same body parsing safety as notion.js
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    const { system, message, max_tokens, model } = body;
    console.log("system length:", system?.length, "message length:", message?.length);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || "claude-opus-5",
        max_tokens: max_tokens || 2000,
        system,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    console.log("Anthropic status:", response.status, JSON.stringify(data).slice(0, 300));
    if (!response.ok) throw new Error(data.error?.message || "API error");
    // Opus 5 thinks by default, so content[0] can be a thinking block.
    // Take the first actual text block rather than assuming index 0.
    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("no text block in response");
    res.status(200).json({ text: textBlock.text });

  } catch (err) {
    console.error("claude handler error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
