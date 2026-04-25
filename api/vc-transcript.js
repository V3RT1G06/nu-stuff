import formidable from "formidable";
import fs from "node:fs/promises";
import path from "node:path";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  const form = formidable({ multiples: false, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

function getAudioMimeType(file) {
  const declared = (file.mimetype || file.type || "").toString();
  if (declared.startsWith("audio/")) return declared;
  const ext = path.extname(file.originalFilename || file.newFilename || "").toLowerCase();
  const map = { ".webm": "audio/webm", ".ogg": "audio/ogg", ".wav": "audio/wav",
                ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac" };
  return map[ext] || "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

  try {
    const { fields, files } = await parseForm(req);
    const audioFile = firstValue(files.audio);

    if (!audioFile) return res.status(400).json({ error: "Missing audio file" });

    const audioBuffer = await fs.readFile(audioFile.filepath);
    if (!audioBuffer?.length) return res.status(400).json({ error: "Audio file is empty" });

    const mimeType = getAudioMimeType(audioFile) || "audio/webm";
    const filename = audioFile.originalFilename || audioFile.newFilename || "audio.webm";

    console.log("[vc-transcript] sending to Groq", { filename, mimeType, size: audioBuffer.length });

    // Groq Whisper — single request, response is immediate (no polling)
    const body = new FormData();
    body.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
    body.append("model", "whisper-large-v3-turbo");
    body.append("language", "en");
    body.append("response_format", "json");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

    const groqData = await groqRes.json().catch(() => null);

    if (!groqRes.ok || typeof groqData?.text !== "string") {
      return res.status(500).json({
        error: "Groq transcription failed",
        details: groqData?.error?.message || groqData || "Unknown error",
      });
    }

    return res.status(200).json({
      text:      groqData.text.trim(),
      roomId:    firstValue(fields.roomId)    || "",
      roomName:  firstValue(fields.roomName)  || "",
      user:      firstValue(fields.user)      || "",
      startedAt: firstValue(fields.startedAt) || "",
      endedAt:   firstValue(fields.endedAt)   || "",
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
