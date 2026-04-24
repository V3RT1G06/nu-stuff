export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers,
      });
    }

    const form = await request.formData();
    const audio = form.get("audio");
    const roomId = String(form.get("roomId") || "");
    const roomName = String(form.get("roomName") || "");
    const user = String(form.get("user") || "");
    const startedAt = String(form.get("startedAt") || "");
    const endedAt = String(form.get("endedAt") || "");

    if (!audio) {
      return new Response(JSON.stringify({ error: "Missing audio file" }), {
        status: 400,
        headers,
      });
    }

    const openaiForm = new FormData();
    openaiForm.append("file", audio, audio.name || "vc-audio.webm");
    openaiForm.append("model", "gpt-4o-mini-transcribe");
    openaiForm.append("response_format", "json");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openaiForm,
    });

    const data = await openaiRes.json().catch(() => null);

    if (!openaiRes.ok) {
      return new Response(JSON.stringify({
        error: "OpenAI transcription failed",
        details: data
      }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({
      text: typeof data?.text === "string" ? data.text.trim() :
