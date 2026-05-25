import type { Signer } from "ethers";
import { buildSystemPrompt } from "./prompt.js";
import { parseLLMResponse } from "./parser.js";
import type { CommandPayload } from "../types/commands.js";
import type { AIConfig } from "../types/ai.js";
import { resolveSigner } from "../chain/adapter.js";

/**
 * AI broker for resolving natural language prompts into robot commands
 * via 0G Compute Network.
 *
 * Uses the @0glabs/0g-serving-broker package to handle authentication,
 * payment, and inference requests through the 0G decentralized compute network.
 */
export class AIBroker {
  private broker: any; // 0g-serving-broker instance
  private signer: Signer;
  private providerAddress: string | null = null;
  private serviceUrl: string | null = null;
  private model: string;
  private systemPrompt: string;

  constructor(config: AIConfig) {
    // Resolve the wallet input the same way ChainConfig does — accept
    // an ethers Signer, a viem WalletClient, or a privateKey + rpcUrl.
    this.signer = resolveSigner(config, "AIConfig");
    this.model = config.model ?? "qwen-2.5-7b-instruct";
    this.systemPrompt = buildSystemPrompt();
    if (config.providerAddress) {
      this.providerAddress = config.providerAddress;
    }
  }

  /**
   * Initialize the 0G Compute broker — discovers a provider for the
   * configured `model` (or uses the explicit `providerAddress`), fetches its
   * service URL, and acknowledges its signer on-chain. **Must be called once
   * before any `resolvePrompt` call.** Subsequent `resolvePrompt` calls
   * consume 0G Compute funds from the configured wallet.
   *
   * @throws If `@0glabs/0g-serving-broker` is not installed.
   * @throws If no provider is found for the configured model.
   */
  async initialize(): Promise<void> {
    let createBroker: any;
    try {
      // @ts-ignore — optional peer dependency, loaded dynamically
      const module = await import("@0glabs/0g-serving-broker");
      createBroker = module.createZGComputeNetworkBroker;
    } catch {
      throw new Error(
        "0G Compute broker not available. Install: npm install @0glabs/0g-serving-broker",
      );
    }

    this.broker = await createBroker(this.signer);

    // Discover a suitable provider if not specified
    if (!this.providerAddress) {
      const services = await this.broker.inference.listService();
      const service = services.find(
        (s: any) => s.model === this.model && s.type === "chatbot",
      );
      if (!service) {
        throw new Error(
          `No 0G Compute provider found for model: ${this.model}`,
        );
      }
      this.providerAddress = service.provider;
    }

    // Get service metadata for the endpoint URL
    const metadata = await this.broker.inference.getServiceMetadata(
      this.providerAddress!,
    );
    this.serviceUrl = metadata.url;

    // Acknowledge the provider's signer
    await this.broker.inference.acknowledgeProviderSigner(
      this.providerAddress!,
    );
  }

  /**
   * Resolve a natural language prompt into a sequence of robot commands via
   * 0G Compute inference. Costs 0G Compute funds per call.
   *
   * @returns Commands in the order the LLM produced them — callers should
   *   dispatch/execute in array order. Empty array if the model produced
   *   nothing actionable.
   * @throws If `initialize()` has not been called.
   */
  async resolvePrompt(prompt: string): Promise<CommandPayload[]> {
    if (!this.broker || !this.providerAddress || !this.serviceUrl) {
      throw new Error("AIBroker not initialized. Call initialize() first.");
    }

    // Get auth headers for the request
    const headers = await this.broker.inference.getRequestHeaders(
      this.providerAddress!,
      prompt,
    );

    // Call the OpenAI-compatible chat completions endpoint
    const response = await fetch(
      `${this.serviceUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `0G Compute inference failed: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from 0G Compute");
    }

    return parseLLMResponse(content);
  }
}
