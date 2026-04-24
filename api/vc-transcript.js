import formidable from "formidable";
import fs from "node:fs/promises";
import path from "node:path";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAudioMimeType(file) {
  const mimeFromField = (file.mimetype || file.type || "").toString();
  if (mimeFromField.startsWith("audio/")) {
    return mimeFromField;
  }

  const ext = path.extname(file.originalFilename || file.newFilename || "").toLowerCase();
  switch (ext) {
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".mp4":
      return "audio/mp4";
    default:
      return "audio/webm";
  }
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

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing ASSEMBLYAI_API_KEY" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const audioFile = firstValue(files.audio);

    if (!audioFile) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    const audioBuffer = await fs.readFile(audioFile.filepath);
    const uploadMime = getAudioMimeType(audioFile);

    console.log("[vc-transcript] audio upload metadata", {
      filename: audioFile.originalFilename || audioFile.newFilename,
      mimetype: audioFile.mimetype || audioFile.type,
      guessedMime: uploadMime,
      size: audioBuffer.length,
    });

    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": uploadMime,
      },
      body: audioBuffer,
    });

    const uploadData = await uploadRes.json().catch(() => null);

    if (!uploadRes.ok || !uploadData?.upload_url) {
      return res.status(500).json({
        error: "AssemblyAI upload failed",
        details: uploadData?.error || uploadData || "Unknown upload error",
      });
    }

    const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadData.upload_url,
        speech_models: ["universal"],
        language_code: "en_us",
      }),
    });

    const transcriptData = await transcriptRes.json().catch(() => null);

    if (!transcriptRes.ok || !transcriptData?.id) {
      return res.status(500).json({
        error: "AssemblyAI transcript submit failed",
        details: transcriptData?.error || transcriptData || "Unknown transcript submit error",
      });
    }

    let finalData = transcriptData;

    for (let i = 0; i < 30; i++) {
      await sleep(1000);

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
        headers: {
          Authorization: apiKey,
        },
      });

      finalData = await pollRes.json().catch(() => null);

      if (finalData?.status === "completed") break;

      if (finalData?.status === "error") {
        return res.status(500).json({
          error: "AssemblyAI transcription failed",
          details: finalData.error || finalData,
        });
      }
    }

    return res.status(200).json({
      text: typeof finalData?.text === "string" ? finalData.text.trim() : "",
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
