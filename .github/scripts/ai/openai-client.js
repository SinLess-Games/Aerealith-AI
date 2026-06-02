#!/usr/bin/env node
// .github/scripts/ai/openai-client.js
// =============================================================================
// Aerealith AI — OpenAI Client Utility
// -----------------------------------------------------------------------------
// Purpose:
//   Shared OpenAI Responses API client for repository AI automation scripts.
//
// Used by:
//   - .github/scripts/ai/build-changelog-draft.js
//   - .github/scripts/ai/create-issue-from-pr.js
//   - .github/scripts/ai/create-pr-from-issue.js
//   - .github/scripts/ai/discussion-announcement.js
//   - .github/scripts/ai/security-triage.js
//   - future AI automation scripts
//
// Notes:
//   - CommonJS only.
//   - Uses Node.js built-in fetch.
//   - Does not require the OpenAI npm package.
//   - Redacts secret-like values before logging or writing context.
//   - Supports text and JSON generation helpers.
//   - Retries transient API failures.
//   - Returns structured metadata so callers can safely fall back locally.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");

let logger = null;

try {
  logger = require("../utils/logger");
} catch {
  logger = {
    info: (message) => console.log(`[openai-client] ${message}`),
    warn: (message) => console.warn(`[openai-client] WARN: ${message}`),
    error: (message) => console.error(`[openai-client] ERROR: ${message}`),
    debug: () => {},
    dump: () => {},
    formatError: (err) => {
      if (!err) return "unknown error";
      if (typeof err === "string") return err;
      return err.message || String(err);
    },
  };
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_RESPONSES_ENDPOINT = "/responses";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 750;
const DEFAULT_MAX_OUTPUT_TOKENS = 5000;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "disabled"]);

const RETRYABLE_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?key|client[_-]?secret|webhook|cookie|session|authorization|bearer|pat|credential|cookie|session)/i;

const SECRET_VALUE_PATTERN =
  /((ghp|github_pat|gho|ghu|ghs|ghr|sk|xoxb|xoxp|npm)_[A-Za-z0-9_=-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|[A-Za-z0-9+/]{32,}={0,2})/g;

class OpenAIClientError extends Error {
  constructor(message, options = {}) {
    super(message);

    this.name = "OpenAIClientError";
    this.status = options.status || null;
    this.code = options.code || null;
    this.type = options.type || null;
    this.request_id = options.request_id || options.requestId || null;
    this.response = options.response || null;
    this.cause = options.cause || null;
    this.retryable = Boolean(options.retryable);
  }
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;

  return String(value).trim() || fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

function normalizeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringList(value) {
  if (value === undefined || value === null || value === "") return [];

  if (Array.isArray(value)) {
    return [
      ...new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    ];
  }

  return [
    ...new Set(
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  return normalizeString(baseUrl, DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeEndpoint(endpoint = DEFAULT_RESPONSES_ENDPOINT) {
  const normalized = normalizeString(endpoint, DEFAULT_RESPONSES_ENDPOINT);

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function redactText(value) {
  return String(value || "").replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function redactValue(value) {
  if (value === undefined || value === null) return value;

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => {
        if (SECRET_KEY_PATTERN.test(key)) {
          return [key, "[REDACTED]"];
        }

        return [key, redactValue(childValue)];
      }),
    );
  }

  return value;
}

function maskForLog(value) {
  const source = normalizeString(value);

  if (!source) return "";

  if (source.length <= 8) return "[REDACTED]";

  return `${source.slice(0, 4)}...[REDACTED]...${source.slice(-4)}`;
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefined(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeUndefined(item)])
        .filter(([, item]) => item !== undefined),
    );
  }

  return value === undefined ? undefined : value;
}

function compactObject(value) {
  return removeUndefined(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);

  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(Number(status));
}

function isAbortError(err) {
  return (
    err?.name === "AbortError" || /abort/i.test(String(err?.message || ""))
  );
}

function createAbortController(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeout),
  };
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripJsonFence(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced) return fenced[1].trim();

  return source;
}

function parseAiJson(text, options = {}) {
  const stripped = stripJsonFence(text);
  const direct = safeJsonParse(stripped, null);

  if (direct !== null) return direct;

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    const objectJson = stripped.slice(start, end + 1);
    const parsedObject = safeJsonParse(objectJson, null);

    if (parsedObject !== null) return parsedObject;
  }

  const arrayStart = stripped.indexOf("[");
  const arrayEnd = stripped.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const arrayJson = stripped.slice(arrayStart, arrayEnd + 1);
    const parsedArray = safeJsonParse(arrayJson, null);

    if (parsedArray !== null) return parsedArray;
  }

  if (options.required === false) {
    return options.fallback ?? null;
  }

  throw new OpenAIClientError("AI response did not contain parseable JSON.", {
    type: "parse_error",
    retryable: false,
  });
}

function extractOpenAIText(responseJson) {
  if (!responseJson) return "";

  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text.trim();
  }

  if (typeof responseJson.text === "string") {
    return responseJson.text.trim();
  }

  if (Array.isArray(responseJson.output)) {
    const chunks = [];

    for (const outputItem of responseJson.output) {
      if (typeof outputItem.text === "string") {
        chunks.push(outputItem.text);
      }

      if (typeof outputItem.value === "string") {
        chunks.push(outputItem.value);
      }

      if (Array.isArray(outputItem.content)) {
        for (const contentItem of outputItem.content) {
          if (typeof contentItem.text === "string") {
            chunks.push(contentItem.text);
          }

          if (typeof contentItem.value === "string") {
            chunks.push(contentItem.value);
          }

          if (typeof contentItem.output_text === "string") {
            chunks.push(contentItem.output_text);
          }

          if (contentItem.text && typeof contentItem.text.value === "string") {
            chunks.push(contentItem.text.value);
          }
        }
      }
    }

    if (chunks.length) {
      return chunks.join("\n").trim();
    }
  }

  if (Array.isArray(responseJson.choices)) {
    const text = responseJson.choices
      .map((choice) => choice.message?.content || choice.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function buildTextInput(input) {
  if (input === undefined || input === null) return "";

  if (typeof input === "string") return input;

  if (Array.isArray(input)) return input;

  return JSON.stringify(redactValue(input), null, 2);
}

function buildJsonPrompt(input, options = {}) {
  const base = buildTextInput(input);
  const schema = options.schema ? JSON.stringify(options.schema, null, 2) : "";

  return [
    options.prompt || "Return only valid JSON.",
    "",
    schema ? "Expected JSON shape:" : "",
    schema ? "```json" : "",
    schema || "",
    schema ? "```" : "",
    "",
    "Input:",
    typeof base === "string" ? base : JSON.stringify(base, null, 2),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function readTextFile(filePath, options = {}) {
  if (!filePath) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error("File path is required.");
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    if (options.required === false) return options.fallback ?? "";
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function writeTextFile(filePath, contents, options = {}) {
  if (!filePath) {
    throw new Error("File path is required.");
  }

  const absolutePath = path.resolve(filePath);

  fs.mkdirSync(path.dirname(absolutePath), {
    recursive: true,
  });

  if (options.dry_run) {
    logger.info(`[dry-run] Would write ${absolutePath}.`);
    return {
      written: false,
      path: absolutePath,
      dry_run: true,
    };
  }

  fs.writeFileSync(absolutePath, contents);

  return {
    written: true,
    path: absolutePath,
    dry_run: false,
  };
}

function createOpenAIHeaders(client, extraHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${client.apiKey}`,
    "Content-Type": "application/json",
    ...(client.organization
      ? { "OpenAI-Organization": client.organization }
      : {}),
    ...(client.project ? { "OpenAI-Project": client.project } : {}),
    ...extraHeaders,
  };

  return headers;
}

function createOpenAIError(message, response, data, options = {}) {
  const error = data?.error || data || {};

  return new OpenAIClientError(message, {
    status: response?.status || options.status || null,
    code: error.code || data?.code || null,
    type: error.type || data?.type || options.type || null,
    request_id:
      response?.headers?.get?.("x-request-id") ||
      response?.headers?.get?.("openai-request-id") ||
      data?.request_id ||
      null,
    response: redactValue(data),
    retryable:
      options.retryable !== undefined
        ? Boolean(options.retryable)
        : isRetryableStatus(response?.status),
  });
}

class OpenAIClient {
  constructor(options = {}) {
    this.apiKey = normalizeString(
      options.apiKey || options.api_key || process.env.OPENAI_API_KEY,
    );
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ||
        options.base_url ||
        process.env.OPENAI_BASE_URL ||
        DEFAULT_BASE_URL,
    );
    this.responsesEndpoint = normalizeEndpoint(
      options.responsesEndpoint ||
        options.responses_endpoint ||
        DEFAULT_RESPONSES_ENDPOINT,
    );
    this.model = normalizeString(
      options.model || process.env.OPENAI_MODEL,
      DEFAULT_MODEL,
    );
    this.organization = normalizeString(
      options.organization || process.env.OPENAI_ORG_ID,
    );
    this.project = normalizeString(
      options.project || process.env.OPENAI_PROJECT_ID,
    );
    this.timeoutMs = normalizeInteger(
      options.timeoutMs || options.timeout_ms || process.env.OPENAI_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    );
    this.maxRetries = normalizeInteger(
      options.maxRetries ||
        options.max_retries ||
        process.env.OPENAI_MAX_RETRIES,
      DEFAULT_MAX_RETRIES,
    );
    this.retryBaseMs = normalizeInteger(
      options.retryBaseMs ||
        options.retry_base_ms ||
        process.env.OPENAI_RETRY_BASE_MS,
      DEFAULT_RETRY_BASE_MS,
    );
    this.dryRun = normalizeBoolean(
      options.dryRun ?? options.dry_run ?? process.env.DRY_RUN,
      false,
    );
    this.requireApiKey = normalizeBoolean(
      options.requireApiKey ?? options.require_api_key,
      false,
    );
    this.fetchImpl =
      options.fetchImpl || options.fetch_impl || globalThis.fetch;

    if (!this.fetchImpl) {
      throw new OpenAIClientError(
        "Fetch is not available. Use Node.js 18+ or pass fetchImpl.",
        {
          type: "configuration_error",
          retryable: false,
        },
      );
    }

    if (this.requireApiKey && !this.apiKey) {
      throw new OpenAIClientError("OPENAI_API_KEY is required.", {
        type: "configuration_error",
        retryable: false,
      });
    }
  }

  get available() {
    return Boolean(this.apiKey) && !this.dryRun;
  }

  get responsesUrl() {
    return `${this.baseUrl}${this.responsesEndpoint}`;
  }

  assertAvailable() {
    if (!this.apiKey) {
      throw new OpenAIClientError("OPENAI_API_KEY is not set.", {
        type: "configuration_error",
        retryable: false,
      });
    }

    if (this.dryRun) {
      throw new OpenAIClientError(
        "OpenAI request skipped because dry-run mode is enabled.",
        {
          type: "dry_run",
          retryable: false,
        },
      );
    }

    return true;
  }

  buildResponsePayload(options = {}) {
    const input = options.input ?? options.prompt ?? "";
    const model = normalizeString(options.model, this.model);

    const maxOutputTokens = normalizeInteger(
      options.max_output_tokens ??
        options.maxOutputTokens ??
        options.max_tokens,
      DEFAULT_MAX_OUTPUT_TOKENS,
    );

    const payload = compactObject({
      model,
      instructions: options.instructions,
      input,
      max_output_tokens: maxOutputTokens,
      temperature: normalizeNumber(options.temperature, undefined),
      top_p: normalizeNumber(options.top_p ?? options.topP, undefined),
      metadata: options.metadata,
      tools: options.tools,
      tool_choice: options.tool_choice ?? options.toolChoice,
      previous_response_id:
        options.previous_response_id ?? options.previousResponseId,
      store: options.store,
      reasoning: options.reasoning,
      text: options.text,
      stream: false,
    });

    return payload;
  }

  async createResponse(options = {}) {
    this.assertAvailable();

    const payload = this.buildResponsePayload(options);

    return this.requestJson(this.responsesUrl, {
      method: "POST",
      body: payload,
      headers: options.headers,
      timeoutMs: options.timeoutMs || options.timeout_ms,
      maxRetries: options.maxRetries ?? options.max_retries,
      retryBaseMs: options.retryBaseMs ?? options.retry_base_ms,
    });
  }

  async requestJson(url, options = {}) {
    const method = normalizeString(options.method, "GET").toUpperCase();
    const maxRetries = normalizeInteger(
      options.maxRetries ?? options.max_retries,
      this.maxRetries,
    );
    const retryBaseMs = normalizeInteger(
      options.retryBaseMs ?? options.retry_base_ms,
      this.retryBaseMs,
    );
    const timeoutMs = normalizeInteger(
      options.timeoutMs ?? options.timeout_ms,
      this.timeoutMs,
    );

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const abort = createAbortController(timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: createOpenAIHeaders(this, options.headers),
          body:
            options.body === undefined || options.body === null
              ? undefined
              : JSON.stringify(options.body),
          signal: abort.controller.signal,
        });

        abort.clear();

        const text = await response.text();
        const data = text ? safeJsonParse(text, text) : null;

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);

          const errorMessage =
            data?.error?.message ||
            data?.message ||
            (typeof data === "string" ? data : "") ||
            response.statusText ||
            "OpenAI request failed.";

          const error = createOpenAIError(errorMessage, response, data, {
            retryable,
          });

          if (!retryable || attempt >= maxRetries) {
            throw error;
          }

          lastError = error;

          const retryAfterMs = parseRetryAfter(
            response.headers?.get?.("retry-after"),
          );
          const delayMs =
            retryAfterMs !== null
              ? retryAfterMs
              : retryBaseMs * Math.pow(2, attempt) +
                Math.floor(Math.random() * 100);

          logger.warn(
            `OpenAI request failed with ${response.status}. Retrying in ${delayMs}ms. Attempt ${attempt + 1}/${maxRetries}.`,
          );

          await sleep(delayMs);
          continue;
        }

        return data;
      } catch (err) {
        abort.clear();

        const retryable = isAbortError(err) || err.retryable;

        if (!retryable || attempt >= maxRetries) {
          if (err instanceof OpenAIClientError) throw err;

          throw new OpenAIClientError(logger.formatError(err), {
            type: isAbortError(err) ? "timeout" : "request_error",
            cause: err,
            retryable: false,
          });
        }

        lastError = err;

        const delayMs =
          retryBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);

        logger.warn(
          `OpenAI request error. Retrying in ${delayMs}ms. Attempt ${attempt + 1}/${maxRetries}. ${logger.formatError(err)}`,
        );

        await sleep(delayMs);
      }
    }

    throw new OpenAIClientError(logger.formatError(lastError), {
      type: "request_error",
      cause: lastError,
      retryable: false,
    });
  }

  async generateText(options = {}) {
    if (!this.available) {
      if (options.require_ai || options.requireAi || this.requireApiKey) {
        this.assertAvailable();
      }

      return {
        ok: false,
        used_ai: false,
        skipped: true,
        reason: this.dryRun
          ? "OpenAI request skipped because dry-run mode is enabled."
          : "OPENAI_API_KEY is not set.",
        text: "",
        response: null,
      };
    }

    const response = await this.createResponse({
      ...options,
      input: buildTextInput(options.input ?? options.prompt ?? ""),
    });

    const text = extractOpenAIText(response);

    if (!text && (options.require_text || options.requireText)) {
      throw new OpenAIClientError(
        "OpenAI response did not contain text output.",
        {
          type: "empty_output",
          response: redactValue(response),
          retryable: false,
        },
      );
    }

    return {
      ok: true,
      used_ai: true,
      skipped: false,
      reason: "OpenAI text generation completed.",
      text,
      response,
    };
  }

  async generateJson(options = {}) {
    const prompt = buildJsonPrompt(options.input ?? options.prompt ?? "", {
      prompt:
        options.json_prompt ||
        options.jsonPrompt ||
        "Return only valid JSON. Do not include Markdown fences.",
      schema: options.schema,
    });

    const result = await this.generateText({
      ...options,
      input: prompt,
      require_text: options.require_text ?? true,
    });

    if (!result.ok) {
      return {
        ...result,
        json: null,
      };
    }

    const json = parseAiJson(result.text, {
      required: options.required !== false,
      fallback: options.fallback ?? null,
    });

    return {
      ...result,
      json,
    };
  }

  async safeGenerateText(options = {}) {
    try {
      return await this.generateText(options);
    } catch (err) {
      if (options.throwOnError || options.throw_on_error) {
        throw err;
      }

      logger.warn(`OpenAI text generation failed: ${logger.formatError(err)}`);

      return {
        ok: false,
        used_ai: false,
        skipped: false,
        reason: logger.formatError(err),
        text: "",
        response: err.response || null,
        error: redactValue({
          message: err.message,
          status: err.status,
          code: err.code,
          type: err.type,
          request_id: err.request_id,
        }),
      };
    }
  }

  async safeGenerateJson(options = {}) {
    try {
      return await this.generateJson(options);
    } catch (err) {
      if (options.throwOnError || options.throw_on_error) {
        throw err;
      }

      logger.warn(`OpenAI JSON generation failed: ${logger.formatError(err)}`);

      return {
        ok: false,
        used_ai: false,
        skipped: false,
        reason: logger.formatError(err),
        text: "",
        json: options.fallback ?? null,
        response: err.response || null,
        error: redactValue({
          message: err.message,
          status: err.status,
          code: err.code,
          type: err.type,
          request_id: err.request_id,
        }),
      };
    }
  }
}

function createOpenAIClient(options = {}) {
  return new OpenAIClient(options);
}

function assertOpenAIAvailable(options = {}) {
  const client = createOpenAIClient({
    ...options,
    requireApiKey: true,
  });

  return client.assertAvailable();
}

async function generateText(options = {}) {
  const client = createOpenAIClient(options.client || options);
  return client.generateText(options);
}

async function generateJson(options = {}) {
  const client = createOpenAIClient(options.client || options);
  return client.generateJson(options);
}

async function safeGenerateText(options = {}) {
  const client = createOpenAIClient(options.client || options);
  return client.safeGenerateText(options);
}

async function safeGenerateJson(options = {}) {
  const client = createOpenAIClient(options.client || options);
  return client.safeGenerateJson(options);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    command: "text",
    prompt: "",
    prompt_file: "",
    instructions: "",
    instructions_file: "",
    input_file: "",
    output_file: "",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    max_output_tokens: normalizeInteger(
      process.env.OPENAI_MAX_OUTPUT_TOKENS,
      DEFAULT_MAX_OUTPUT_TOKENS,
    ),
    temperature: normalizeNumber(process.env.OPENAI_TEMPERATURE, undefined),
    json: false,
    require_ai: normalizeBoolean(process.env.OPENAI_REQUIRE_AI, false),
    dry_run: normalizeBoolean(
      process.env.DRY_RUN || process.env.PROJECT_SYNC_DRY_RUN,
      false,
    ),
    print: true,
  };

  if (argv[0] && !argv[0].startsWith("-")) {
    args.command = argv[0];
    argv = argv.slice(1);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--prompt" || arg === "-p") {
      args.prompt = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--prompt-file") {
      args.prompt_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--instructions") {
      args.instructions = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--instructions-file") {
      args.instructions_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--input-file") {
      args.input_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      args.output_file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--model") {
      args.model = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--max-output-tokens") {
      args.max_output_tokens = normalizeInteger(
        argv[index + 1],
        DEFAULT_MAX_OUTPUT_TOKENS,
      );
      index += 1;
      continue;
    }

    if (arg === "--temperature") {
      args.temperature = normalizeNumber(argv[index + 1], undefined);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg === "--require-ai") {
      args.require_ai = true;
      continue;
    }

    if (arg === "--dry-run") {
      args.dry_run = true;
      continue;
    }

    if (arg === "--no-print") {
      args.print = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Aerealith AI OpenAI Client Utility

Usage:
  node .github/scripts/ai/openai-client.js [text|json|health] [options]

Commands:
  text                     Generate text from prompt/input.
  json                     Generate JSON from prompt/input.
  health                   Check whether the client is configured.

Options:
  -p, --prompt <text>              Prompt text.
      --prompt-file <file>         Prompt file.
      --instructions <text>        System/developer instructions.
      --instructions-file <file>   Instructions file.
      --input-file <file>          Input file appended to prompt.
  -o, --output <file>              Output file.
      --model <model>              OpenAI model.
      --max-output-tokens <n>      Maximum output tokens.
      --temperature <number>       Sampling temperature.
      --json                       Parse output as JSON.
      --require-ai                 Fail if OPENAI_API_KEY is missing.
      --dry-run                    Skip API call.
      --no-print                   Do not print result.
`);
}

async function runCli() {
  const args = parseArgs();
  const promptParts = [];

  if (args.prompt_file) {
    promptParts.push(readTextFile(args.prompt_file));
  }

  if (args.prompt) {
    promptParts.push(args.prompt);
  }

  if (args.input_file) {
    promptParts.push(readTextFile(args.input_file));
  }

  const instructions = args.instructions_file
    ? readTextFile(args.instructions_file)
    : args.instructions;

  const client = createOpenAIClient({
    model: args.model,
    dryRun: args.dry_run,
    requireApiKey: args.require_ai,
  });

  if (args.command === "health") {
    const output = {
      ok: client.available,
      dry_run: client.dryRun,
      model: client.model,
      base_url: client.baseUrl,
      api_key_configured: Boolean(client.apiKey),
      api_key_preview: maskForLog(client.apiKey),
    };

    const rendered = `${JSON.stringify(redactValue(output), null, 2)}\n`;

    if (args.output_file) {
      writeTextFile(args.output_file, rendered, {
        dry_run: args.dry_run,
      });
    }

    if (args.print) {
      console.log(rendered.trim());
    }

    return;
  }

  const input = promptParts.join("\n\n").trim();

  if (!input) {
    throw new Error("Prompt or input file is required.");
  }

  const baseOptions = {
    instructions,
    input,
    model: args.model,
    max_output_tokens: args.max_output_tokens,
    temperature: args.temperature,
    require_ai: args.require_ai,
  };

  const result =
    args.command === "json" || args.json
      ? await client.safeGenerateJson(baseOptions)
      : await client.safeGenerateText(baseOptions);

  const rendered =
    args.command === "json" || args.json
      ? `${JSON.stringify(redactValue(result.json ?? result), null, 2)}\n`
      : `${result.text || ""}\n`;

  if (args.output_file) {
    writeTextFile(args.output_file, rendered, {
      dry_run: args.dry_run,
    });
  }

  if (args.print) {
    console.log(rendered.trim());
  }

  if (!result.ok && args.require_ai) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_RESPONSES_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  TRUE_VALUES,
  FALSE_VALUES,
  RETRYABLE_STATUS_CODES,
  SECRET_KEY_PATTERN,
  SECRET_VALUE_PATTERN,

  OpenAIClientError,
  OpenAIClient,

  normalizeString,
  normalizeBoolean,
  normalizeInteger,
  normalizeNumber,
  normalizeStringList,
  normalizeBaseUrl,
  normalizeEndpoint,

  redactText,
  redactValue,
  maskForLog,

  removeUndefined,
  compactObject,

  sleep,
  parseRetryAfter,
  isRetryableStatus,
  isAbortError,
  createAbortController,

  safeJsonParse,
  stripJsonFence,
  parseAiJson,
  extractOpenAIText,
  buildTextInput,
  buildJsonPrompt,

  readTextFile,
  writeTextFile,

  createOpenAIHeaders,
  createOpenAIError,
  createOpenAIClient,
  assertOpenAIAvailable,

  generateText,
  generateJson,
  safeGenerateText,
  safeGenerateJson,
};
