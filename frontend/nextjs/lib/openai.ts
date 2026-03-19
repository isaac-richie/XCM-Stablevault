const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses";

export function isOpenAiConfigured() {
  return Boolean(OPENAI_API_KEY);
}

function extractOutputText(payload: any): string | null {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim()) {
        parts.push(entry.text.trim());
      }
    }
  }

  const joined = parts.join("\n\n").trim();
  return joined || null;
}

export async function generateVaultExplanation(input: {
  account: string;
  recommendation: {
    score: number;
    posture: string;
    action: string;
    suggestedAmountPas: string;
    explanation: string;
    reasons: string[];
    constraints: string[];
    pendingActions: number;
    failedActions: number;
    beneficiary: string;
  };
  actions: Array<{
    status: string;
    amountDisplay: string;
    beneficiary: string;
    createdAt: string;
    error?: string;
  }>;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are the AI explanation layer for a DeFi stable vault. Explain deterministic recommendations clearly and conservatively. Do not invent market data. Keep the answer under 180 words. Include: current posture, why the recommendation exists, what the user should do next, and any safety caveats."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input)
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) {
    throw new Error("OpenAI response did not include readable output text");
  }

  return text;
}
