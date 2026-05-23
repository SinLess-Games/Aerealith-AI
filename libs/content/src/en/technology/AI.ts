// libs/content/src/en/technology/AI.ts

import type { ReadonlyCardArray } from '../../types';

export const aiToolsCards = [
  {
    title: 'AI & ML',
    description:
      'Model providers, inference platforms, local runtimes, gateways, evaluation tools, and operational services for building and running modern AI-powered systems.',
    listItems: [
      {
        text: 'OpenAI',
        href: 'https://openai.com/api/',
        role: 'Frontier Models & APIs',
        detailedDescription:
          'OpenAI provides an API platform for building with frontier AI models across text, reasoning, coding, vision, audio, and multimodal application workflows. It is useful for assistants, agents, retrieval workflows, structured generation, tool calling, automation, and production AI features. Helix AI can use OpenAI as one possible cloud inference provider when users or deployments need hosted frontier-model capability.',
      },
      {
        text: 'Anthropic Claude',
        href: 'https://www.anthropic.com/api',
        role: 'Reasoning & Assistant Models',
        detailedDescription:
          'Claude is Anthropic’s family of AI models designed for conversational reasoning, writing, coding, document analysis, long-context workflows, and enterprise assistant use cases. Anthropic emphasizes safety, steerability, and responsible deployment practices. Helix AI can treat Claude as a strong option for long-context reasoning, coding support, document review, and user-facing assistant experiences.',
      },
      {
        text: 'Google Gemini',
        href: 'https://ai.google.dev/',
        role: 'Multimodal AI Models',
        detailedDescription:
          'Google Gemini provides multimodal AI capabilities across text, image, audio, video, code, and reasoning workflows. It is useful for applications that need broad context handling, model-assisted development, content understanding, and integration with Google’s AI ecosystem. Helix AI can use Gemini as another inference option for multimodal assistant features, document workflows, and cloud-connected intelligence.',
      },
      {
        text: 'Mistral AI',
        href: 'https://mistral.ai/',
        role: 'Open & Commercial AI Models',
        detailedDescription:
          'Mistral AI provides frontier and open-weight model options for text generation, reasoning, coding, multilingual workflows, and enterprise AI applications. It is useful for teams that want strong model performance with flexible deployment and licensing options. Helix AI can evaluate Mistral models for hosted inference, self-hosted experiments, and future deployment paths where openness and control matter.',
      },
      {
        text: 'Cohere',
        href: 'https://cohere.com/',
        role: 'Enterprise AI Models',
        detailedDescription:
          'Cohere provides AI models and services focused on enterprise language understanding, retrieval, generation, classification, and multilingual workflows. It is useful for organizations that need business-oriented AI capabilities, private data workflows, and production-ready model access. Helix AI can use Cohere as an option for enterprise assistant features, retrieval workflows, and structured business use cases.',
      },
      {
        text: 'DeepSeek',
        href: 'https://www.deepseek.com/',
        role: 'Reasoning & Coding Models',
        detailedDescription:
          'DeepSeek provides AI models focused on reasoning, coding, technical problem solving, and efficient model performance. It is useful for development workflows, code assistance, analysis, and cost-sensitive AI routing strategies. Helix AI can evaluate DeepSeek as part of a broader model-routing strategy where capability, latency, privacy, and cost need to be balanced.',
      },
      {
        text: 'Vertex AI',
        href: 'https://cloud.google.com/vertex-ai',
        role: 'Managed AI Platform',
        detailedDescription:
          'Vertex AI is Google Cloud’s managed platform for building, training, deploying, evaluating, and monitoring machine-learning and generative-AI workloads. It combines model tooling, pipelines, hosted inference, model governance, evaluation features, and access to Google and partner model ecosystems. Helix AI can use Vertex AI for enterprise deployments that already rely on Google Cloud governance, infrastructure, and data services.',
      },
      {
        text: 'Cloudflare Workers AI',
        href: 'https://developers.cloudflare.com/workers-ai/',
        role: 'Edge AI Inference',
        detailedDescription:
          'Cloudflare Workers AI provides serverless AI inference close to users through Cloudflare’s edge network. It is useful for low-latency AI features, lightweight inference, embeddings, classification, summarization, and edge-native application workflows. Helix AI can use Workers AI as part of an edge-first architecture for fast, scalable, cost-aware AI tasks that do not always require a frontier model.',
      },
      {
        text: 'Groq',
        href: 'https://groq.com/',
        role: 'Fast AI Inference',
        detailedDescription:
          'Groq provides high-speed AI inference infrastructure designed for low-latency model serving. It is useful for interactive assistants, real-time workflows, fast response generation, and performance-sensitive AI applications. Helix AI can use Groq as an inference option for workloads where response speed and interactive user experience are especially important.',
      },
      {
        text: 'Together AI',
        href: 'https://www.together.ai/',
        role: 'Open Model Inference',
        detailedDescription:
          'Together AI provides cloud inference, fine-tuning, and deployment services for a wide range of open and commercial AI models. It is useful for experimenting with model choice, hosting open-weight models, and scaling AI workloads without managing all serving infrastructure directly. Helix AI can use Together AI as a provider option for open-model routing and cost-aware inference.',
      },
      {
        text: 'Fireworks AI',
        href: 'https://fireworks.ai/',
        role: 'Production AI Inference',
        detailedDescription:
          'Fireworks AI provides infrastructure for serving and fine-tuning generative AI models with a focus on production readiness, performance, and model variety. It is useful for teams that need scalable hosted inference while retaining flexibility across model families. Helix AI can evaluate Fireworks AI for hosted model serving, performance-sensitive workloads, and provider redundancy.',
      },
      {
        text: 'Replicate',
        href: 'https://replicate.com/',
        role: 'Hosted Model Execution',
        detailedDescription:
          'Replicate provides hosted access to many AI models through a developer-friendly API, especially for image, audio, video, and open-source model workflows. It is useful for quickly testing model capabilities, running specialized models, and adding creative AI features without managing infrastructure. Helix AI can use Replicate for experimental media workflows, prototype features, and specialized model tasks.',
      },
      {
        text: 'Hugging Face',
        href: 'https://huggingface.co/',
        role: 'Model & Dataset Hub',
        detailedDescription:
          'Hugging Face is a major collaboration platform for machine-learning models, datasets, demos, and open-source AI tooling. It supports model discovery, evaluation, hosting, private repositories, inference endpoints, and developer workflows around model assets and AI deployment services. Helix AI can use Hugging Face as a discovery, experimentation, and deployment layer for open and custom models.',
      },
      {
        text: 'OpenRouter',
        href: 'https://openrouter.ai/',
        role: 'Model Access Gateway',
        detailedDescription:
          'OpenRouter provides access to many AI models through a unified API, making it easier to compare models, test capabilities, and route requests across providers. It is useful for experimentation, model benchmarking, provider flexibility, and fallback strategies. Helix AI can use this kind of gateway model during development and testing to evaluate which models best fit different workflows.',
      },
      {
        text: 'LiteLLM',
        href: 'https://www.litellm.ai/',
        role: 'LLM Gateway & Routing',
        detailedDescription:
          'LiteLLM provides a unified interface for calling many LLM providers through a consistent API shape. It is useful for model routing, fallback logic, cost tracking, provider abstraction, and managing multiple AI backends. Helix AI can use a gateway pattern like LiteLLM to support hybrid inference, provider failover, cost controls, and deployment-specific model selection.',
      },
      {
        text: 'Ollama',
        href: 'https://ollama.com/',
        role: 'Local AI Runtime',
        detailedDescription:
          'Ollama provides a local-first runtime for running and managing AI models on developer machines and supported environments, with a simple CLI, model library, and local API. It is useful for privacy-focused workflows, local prototyping, offline experimentation, and self-hosted assistant features. Helix AI can use Ollama as a practical option for local inference, air-gapped experiments, and user-controlled model execution.',
      },
      {
        text: 'LM Studio',
        href: 'https://lmstudio.ai/',
        role: 'Local Model Workspace',
        detailedDescription:
          'LM Studio provides a desktop environment for discovering, downloading, running, and testing local AI models. It is useful for local experimentation, privacy-focused workflows, model comparison, and developer testing without relying entirely on hosted APIs. Helix AI can use LM Studio as a useful tool in the local-model experimentation and self-hosted testing workflow.',
      },
      {
        text: 'vLLM',
        href: 'https://www.vllm.ai/',
        role: 'High-Throughput LLM Serving',
        detailedDescription:
          'vLLM is an inference and serving engine focused on efficient, high-throughput language-model deployment. It is useful for self-hosted model serving, batching, production inference, and reducing the cost of running open-weight models at scale. Helix AI can use vLLM in future self-hosted, enterprise, or air-gapped deployments where control, performance, and cost optimization matter.',
      },
      {
        text: 'NVIDIA NIM',
        href: 'https://www.nvidia.com/en-us/ai/',
        role: 'Enterprise AI Inference',
        detailedDescription:
          'NVIDIA NIM provides optimized inference microservices and deployment options for running AI models across enterprise infrastructure. It is useful for organizations that need GPU-accelerated AI serving, private deployments, and production inference workflows. Helix AI can evaluate NVIDIA NIM for enterprise, self-hosted, and infrastructure-heavy deployment paths.',
      },
      {
        text: 'ONNX Runtime',
        href: 'https://onnxruntime.ai/',
        role: 'Cross-Platform Model Runtime',
        detailedDescription:
          'ONNX Runtime is a high-performance runtime for running machine-learning models across different hardware, platforms, and deployment environments. It is useful for portable inference, optimized execution, and edge or self-hosted AI workloads. Helix AI can use ONNX Runtime for future local inference, specialized models, and deployment scenarios where portability and performance matter.',
      },
      {
        text: 'Promptfoo',
        href: 'https://www.promptfoo.dev/',
        role: 'Prompt Testing & Evaluation',
        detailedDescription:
          'Promptfoo is a testing and evaluation tool for prompts, model outputs, and AI application behavior. It is useful for regression testing, comparing models, validating prompt changes, checking safety behavior, and preventing production quality drops. Helix AI can use prompt evaluation tooling to test assistant behavior before releasing new prompts, personas, automations, and model-routing changes.',
      },
      {
        text: 'Ragas',
        href: 'https://docs.ragas.io/',
        role: 'RAG Evaluation',
        detailedDescription:
          'Ragas is an evaluation framework focused on retrieval-augmented generation systems. It helps measure answer relevance, faithfulness, context quality, retrieval performance, and other RAG-specific behaviors. Helix AI can use RAG evaluation tools to improve memory retrieval, knowledge-base answers, document workflows, and source-grounded assistant responses.',
      },
      {
        text: 'MLflow',
        href: 'https://mlflow.org/',
        role: 'ML Lifecycle Management',
        detailedDescription:
          'MLflow is an open-source platform for managing the machine-learning lifecycle, including experiments, model tracking, evaluation, packaging, and deployment workflows. It is useful for teams that need repeatable model development and operational visibility. Helix AI can use MLflow-style lifecycle practices for tracking model experiments, evaluation results, and deployment decisions.',
      },
      {
        text: 'Weights & Biases',
        href: 'https://wandb.ai/',
        role: 'AI Experiment Tracking',
        detailedDescription:
          'Weights & Biases provides experiment tracking, model evaluation, dataset versioning, dashboards, and collaboration tools for machine-learning teams. It is useful for monitoring model behavior, comparing runs, and managing AI development workflows. Helix AI can use experiment tracking principles to measure AI quality, model performance, prompt changes, and production behavior over time.',
      },
    ],
    image: '/images/technology/ai-tools.png',
    link: '/technology/ai-tools',
    buttonText: 'Explore tools',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `aiToolsCards` for new imports.
 */
export const AIToolsCards = aiToolsCards;