// libs/shared/site-content/src/lib/technology/AI.ts

import type { CardProps } from '../types/card';

export const AIToolsCards = {
  title: 'AI & ML',
  description:
    'Leading platforms and frameworks for building and deploying modern machine-learning solutions.',
  listItems: [
    {
      text: 'OpenAI',
      href: 'https://openai.com/',
      role: 'LLMs & APIs',
      detailedDescription:
        'OpenAI researches and deploys advanced general-purpose AI such as GPT-4o—its May 2025 multimodal flagship that operates across text, vision, and audio in real time. The organization offers a self-serve API, an Assistants framework, and ChatGPT clients spanning free, Plus, and Enterprise tiers. Robust safety systems, granular permissions, and a vibrant plugin ecosystem make it a go-to foundation for developers building everything from research pipelines to consumer voice agents.',
    },
    {
      text: 'Claude 3.5 Sonnet',
      href: 'https://claude.ai/',
      role: 'Anthropic LLM',
      detailedDescription:
        'Claude 3.5 Sonnet, launched June 2025, delivers GPT-4-class reasoning with twice the speed of its predecessor and a vast 200 000-token context window. Anthropic trains the model under its Constitutional AI framework to provide safer, more steerable outputs and strict enterprise privacy guarantees. Available via web app, native API, Amazon Bedrock, and Google Vertex AI, it excels at complex coding, data analysis, and multimodal tasks while remaining cost-efficient at $3/M input and $15/M output tokens.',
    },
    {
      text: 'Hugging Face',
      href: 'https://huggingface.co/',
      role: 'Model Hub',
      detailedDescription:
        'Hugging Face Hub hosts the world’s largest open repository of machine-learning assets—over 1.7 million models, 400 000 datasets, and 600 000 demo Spaces—plus flagship libraries like Transformers, Diffusers, and PEFT. Researchers can version models, run comparisons, and deploy with turnkey Inference Endpoints, while enterprises leverage private hubs and on-prem serving. Deep partnerships with AWS, Microsoft, Google, and AMD ensure seamless integration across cloud and hardware back ends.',
    },
    {
      text: 'TensorFlow',
      href: 'https://www.tensorflow.org/',
      role: 'ML Framework',
      detailedDescription:
        'TensorFlow is Google’s end-to-end differentiable-programming framework, first open-sourced in 2015 and now adopted across industry and academia. The modern 2.x line unifies eager and graph execution through Keras, runs on CPUs, GPUs, and TPUs, and extends to edge devices via TensorFlow Lite. The March 2024 2.16 release introduces Clang-built wheels, Keras 3 default, Python 3.12 support, and tighter XLA/GML optimizations—yielding notable performance and portability gains for production pipelines.',
    },
    {
      text: 'PyTorch',
      href: 'https://pytorch.org/',
      role: 'DL Framework',
      detailedDescription:
        'PyTorch offers Python-native, dynamic-graph deep learning favored by researchers for its intuitive debugging and flexibility. Under the Linux-Foundation-backed PyTorch Foundation, the 2.x series adds `torch.compile`, TorchDynamo, and Inductor for ahead-of-time graph optimization: benchmarks show 30-50 % speedups on common GPU workloads. A vast ecosystem—TorchVision, Lightning, Diffusers, vLLM—combined with strong community governance and interoperability keeps PyTorch at the cutting edge of model development and deployment.',
    },
    {
      text: 'Vertex AI',
      href: 'https://cloud.google.com/vertex-ai',
      role: 'MLOps Platform',
      detailedDescription:
        'Vertex AI unifies Google Cloud’s AutoML, custom training, and MLOps workflow tooling behind a single API. Teams orchestrate pipelines, hyper-tuning, hosting, and continuous monitoring with built-in governance and lineage tracking. Vertex Model Garden surfaces frontier models—including Gemini 1.5 Pro, Claude, Llama 3—and Generative AI Studio offers low-code prompt design plus RAG templates for quick POCs. Support for CPUs, GPUs, and TPUs, plus pay-as-you-go pricing, lets organizations scale effortlessly from prototype to production.',
    },
    {
      text: 'Keras',
      href: 'https://keras.io/',
      role: 'High-Level DL API',
      detailedDescription:
        'Keras is a high-level, Pythonic deep-learning API that now serves as a thin, unified interface over TensorFlow, JAX, and PyTorch back-ends. Version 3.0 (March 2024) re-introduced multi-backend support, delivered zero-copy data pipelines, and debuted Keras Core export for framework-agnostic deployment to ONNX, TF-Serving, and WebAssembly. The library’s declarative layers, functional graphs, and AutoModel generation make rapid prototyping and production deployment equally straightforward.',
    },
    {
      text: 'Matplotlib',
      href: 'https://matplotlib.org/',
      role: 'Plotting Library',
      detailedDescription:
        'Matplotlib is the foundational 2D/3D plotting library that powers Python’s scientific-visualization stack. Its 3.9.0 release (May 2024) introduced vectorized offset paths for faster scatter plots, native macOS ARM64 wheels, and a new default theme aligned with modern seaborn styles. The library integrates tightly with NumPy, Pandas, and Jupyter, enabling interactive notebooks as well as publication-quality static figures exported to PDF, SVG, and PGF.',
    },
    {
      text: 'LangChain',
      href: 'https://www.langchain.com/',
      role: 'LLM Framework',
      detailedDescription:
        'LangChain is a modular framework for orchestrating large-language-model workflows such as retrieval-augmented generation, function calling, and multi-agent planning. Version 0.2 (May 2024) unified its Python and JavaScript APIs, added async streaming, and abstracted vector stores over Milvus, Weaviate, PGVector, and Chroma. Built-in integrations span OpenAI, Claude, Gemini, and local GGUF models via Ollama, making it the de-facto glue layer for production LLM apps.',
    },
    {
      text: 'Ollama',
      href: 'https://ollama.com/',
      role: 'Local LLM Runtime',
      detailedDescription:
        'Ollama is a lightweight runtime that lets developers pull, run, and fine-tune quantized language models locally on macOS, Linux, and Windows WSL. Its 0.2 release (May 2025) introduced automatic GPU acceleration, customizable model composition via `Modelfile`, and a growing library of models, including Llama 3, Phi-3-mini, and Mistral 7B. Streaming REST endpoints and a `ollama run` CLI simplify swapping between cloud and on-device inference while ensuring data privacy.',
    },
  ],
  image: '/images/technology/ai-tools.png',
  link: '/technology/ai-tools',
  buttonText: 'Explore tools',
} as const satisfies CardProps;
