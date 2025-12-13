export const AI_MODELS = {
  GEMINI_FLASH: 'gemini-2.5-flash-latest',
  GEMINI_PRO: 'gemini-2.5-pro-latest',
  GEMINI_IMAGEN: 'imagen-3.0-generate-001',
  OPENAI_GPT4_TURBO: 'gpt-4o',
  ANTHROPIC_OPUS: 'claude-3-5-sonnet-20241022',
  ANTHROPIC_HAIKU: 'claude-3-5-haiku-20241022',
  GROQ_MODELS: [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.2-90b-text-preview',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ],
  OPENROUTER_DEFAULT: [
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-flash-1.5-exp',
    'anthropic/claude-3.5-sonnet',
    'mistralai/mistral-large'
  ]
} as const;

export const TARGET_MIN_WORDS = 2000;
export const TARGET_MAX_WORDS = 5000;