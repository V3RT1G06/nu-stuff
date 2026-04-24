import formidable from "formidable";
import fs from "node:fs/promises";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
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
    const { fields, files } = await parseForm(req);
    const audioFile = firstValue(files.audio);

    if (!audioFile) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    const audioBuffer = await fs.readFile(audioFile.filepath);
    const fileBlob = new Blob([audioBuffer], {
      type: audioFile.mimetype || "audio/webm",
    });

    const form = new FormData();
    form.append("file", fileBlob, audioFile.originalFilename || "vc-audio.webm");
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("response_format", "json");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
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
      roomId: firstValue(fields.roomId) || "",
      roomName: firstValue(fields.roomName) || "",
      user: firstValue(fields.user) || "",
      startedAt: firstValue(fields.startedAt) || "",
      endedAt: firstValue(fields.endedAt) || "",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: String(error?.message || error),
    });
  }
}
