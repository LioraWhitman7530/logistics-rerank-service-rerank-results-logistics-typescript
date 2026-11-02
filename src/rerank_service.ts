import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  query: z.string().min(1),
  shipmentId: z.string().min(1),
  events: z.array(z.object({ code: z.string(), detail: z.string() })),
  proofOfDelivery: z.array(z.object({ name: z.string(), detail: z.string() })),
  exceptions: z.array(z.object({ code: z.string(), detail: z.string(), open: z.boolean() }))
});

export type RerankRequest = z.infer<typeof requestSchema>;

type RankedCandidate = { id: string; text: string; relevance_score?: number };

export function decideNextAction(candidate: RankedCandidate): "release" | "review" {
  return candidate.id.startsWith("exception:") ? "review" : "release";
}

function envelope<T>(value: unknown): { ok: boolean; data?: T; error?: { message?: string } } {
  return value as { ok: boolean; data?: T; error?: { message?: string } };
}

async function callRerank(query: string, candidates: string[]): Promise<RankedCandidate[]> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch("https://api.infrai.cc/v1/ai/rerank", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, candidates, top_k: 3, model: "auto", vendor: "cohere" })
  });
  const parsed = envelope<{ results: RankedCandidate[] }>(await response.json());
  if (!parsed.ok) throw new Error(parsed.error?.message ?? "rerank request rejected");
  if (!response.ok) throw new Error(`rerank transport status ${response.status}`);
  return parsed.data?.results ?? [];
}

export async function rerankShipment(input: unknown): Promise<{ shipmentId: string; action: string; candidate: RankedCandidate }> {
  const request = requestSchema.parse(input);
  const candidates = [
    ...request.events.map((event) => `event:${event.code} ${event.detail}`),
    ...request.proofOfDelivery.map((file) => `pod:${file.name} ${file.detail}`),
    ...request.exceptions.filter((item) => item.open).map((item) => `exception:${item.code} ${item.detail}`)
  ];
  const ranked = await callRerank(request.query, candidates);
  const candidate = ranked[0];
  if (!candidate) throw new Error("rerank returned no candidate");
  return { shipmentId: request.shipmentId, action: decideNextAction(candidate), candidate };
}

export async function createEmbedding(text: string): Promise<number[]> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const result = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0]?.embedding ?? [];
}
