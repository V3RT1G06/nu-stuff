const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const incoming = await request.formData();

    const audio = incoming.get("audio");
    const roomId = String(incoming.get("roomId") || "");
    const roomName = String(incoming.get("roomName") || "");
    const user = String(incoming.get("user") || "");
    const startedAt = String(incoming.get("startedAt") || "");
    const endedAt = String(incoming.get("endedAt") || "");

    if (!(audio instanceof File)) {
      return Response.json(
        { error: "Missing audio file" },
        { status: 400, headers: corsHeaders }
      );
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
      return Response.json(
        {
          error: "OpenAI transcription failed",
          details: data,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const text = typeof data?.text === "string" ? data.text.trim() : "";

    return Response.json(
      {
        text,
        roomId,
        roomName,
        user,
        startedAt,
        endedAt,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      {
        error: "Server error",
        details: String(error?.message || error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
