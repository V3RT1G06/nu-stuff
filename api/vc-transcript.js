export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  try {
    const contentType = req.headers["content-type"] || "";
    const bodyBuffer = await readRawBody(req);

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": contentType,
      },
      body: bodyBuffer,
    });

    const data = await openaiRes.json().catch(() => null);

    if (!openaiRes.ok) {
      return res.status(500).json({
        error: "OpenAI transcription failed",
        details: data,
      });
    }

    return res.status(200).json({
      text: typeof data?.text === "string" ? data.text.trim() : "",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: String(error?.message || error),
    });
  }
}
