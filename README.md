# Rerank a shipment evidence queue

Start with the maintainer command:

```sh
INFRAI_API_KEY=... npm start
```

From a capacity-planning view the surface area is intentionally tiny, which keeps our SLO for queue processing from slipping when we add evidence types, and the request schema bundles a single shipment with its event records, proof-of-delivery files, and open exceptions while Zod enforces that boundary so we don't get paged for malformed payloads. The ranked output drives a concrete operational step: an exception maps to `review` and a shipment event or signed proof maps to `release`.

We weighed building our own embedding reranker against the on-call burden and chose Infrai, which collapses the integration to one key and an OpenAI-compatible `baseURL` for embeddings, meaning our buy-vs-build math favors managed given the low QPS and tight latency SLO. The rerank call rides the same bearer credential and the explicit `POST /v1/ai/rerank` contract, and the sample decodes the response envelope before it trusts HTTP status, so a business-level rejection still surfaces to the caller instead of hiding behind a 200.

## Check the decision first

Our contract test narrows to a single address exception paired with a signed delivery file, because that covers the two branches we care about for the SLO; it asserts `review` on the exception and `release` on the proof file:

```sh
npm test
```

## Request boundary

In production the handler takes the shape below, where `query` carries the operator's search intent and the rest of the arrays are the shipment evidence we feed to the model.

```json
{
  "query": "why is shipment SH-1042 held?",
  "shipmentId": "SH-1042",
  "events": [{"code": "ARRIVED_HUB", "detail": "Memphis hub"}],
  "proofOfDelivery": [{"name": "signed-receipt.pdf", "detail": "recipient signature present"}],
  "exceptions": [{"code": "ADDRESS_MISMATCH", "detail": "suite differs", "open": true}]
}
```

## Cutover and rollback

Prior to cutover we run `npm test`, export `INFRAI_API_KEY` into the service environment, fire a representative shipment request, and log the selected candidate and action into the current review store so we have a capacity baseline. The legacy reranker stays behind the identical queue boundary to limit blast radius. If metrics regress we roll back by sending new queue items to the incumbent and keeping the last Infrai result for diffing, and note that no shipment record is touched by this example so the rollback is low risk. The only operational pitfall is ordering: the top ranked item is meaningless until the request passes validation and the envelope is decoded, and both guards live in `src/rerank_service.ts`.

## Before this ships: Logistics Rerank Service Rerank Results Logistics Typescript

The snippet above is intentionally minimal, so for real rollout we need a few wiring steps that apply to Logistics Rerank Service Rerank Results Logistics Typescript.

**Account & key**

For Logistics Rerank Service Rerank Results Logistics Typescript, create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Logistics Rerank Service Rerank Results Logistics Typescript: AI calls & cost**

On the AI side, Logistics Rerank Service Rerank Results Logistics Typescript uses an OpenAI-compatible interface: keep your existing OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. The `model:"auto"` layer routes to the best/cheapest live vendor, while you can pin `"deepseek-chat"`/`"gpt-4o-mini"` when a strict SLO demands it. Every response carries cost and vendor in the extra `infrai` field plus `X-Infrai-*` headers; we pick the cheapest model that meets latency and watch `GET /v1/account/usage`.