/**
 * HashDo Card Spec v2
 *
 * A card is a self-contained, actionable UI unit that can be compiled to
 * multiple AI platform targets (MCP, A2UI, Adaptive Cards, standalone HTML).
 */

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

export type InputType = 'string' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'json';

export interface InputDefinition {
  /** Type of the input value */
  type: InputType;
  /** Human-readable description (used by LLMs for tool parameter docs) */
  description: string;
  /** Whether this input must be provided */
  required?: boolean;
  /** Default value when not provided */
  default?: unknown;
  /** Allowed values (generates enum in tool schemas) */
  enum?: readonly unknown[];
  /** Mark as sensitive — will be encrypted in transit/storage */
  sensitive?: boolean;
}

/** Map of input name → definition */
export type InputSchema = Record<string, InputDefinition>;

/** Derive a typed values object from an InputSchema */
export type InputValues<S extends InputSchema> = {
  [K in keyof S]: S[K]['type'] extends 'number' ? number
    : S[K]['type'] extends 'boolean' ? boolean
    : string;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Card state — arbitrary JSON-serializable data persisted across renders */
export type CardState = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionDefinition<S extends InputSchema = InputSchema> {
  /** Human-readable label shown on buttons/controls */
  label: string;
  /** Description for LLMs when using this action as a tool */
  description?: string;
  /** Additional inputs required for this action */
  inputs?: InputSchema;
  /** Permission level required to execute this action */
  permission?: 'auto' | 'confirm' | 'explicit';
  /** Handler executed when the action is triggered */
  handler: (context: ActionContext<S>) => Promise<ActionResult>;
}

export interface ActionContext<S extends InputSchema = InputSchema> {
  /** Original card inputs */
  cardInputs: InputValues<S>;
  /** Current card state */
  state: CardState;
  /** Action-specific input values */
  actionInputs: Record<string, unknown>;
}

export interface ActionResult {
  /** Updated state (merged with existing) */
  state?: CardState;
  /** Data to return to the caller (shown in AI response) */
  output?: unknown;
  /** Optional message to display */
  message?: string;
}

// ---------------------------------------------------------------------------
// Card Data (server-side fetch)
// ---------------------------------------------------------------------------

export interface GetDataContext<S extends InputSchema = InputSchema> {
  /** Validated input values */
  inputs: InputValues<S>;
  /** Previously persisted card state (empty object on first render) */
  state: CardState;
}

export interface GetDataResult {
  /** Data passed to the template for rendering */
  viewModel: Record<string, unknown>;
  /** State to persist for next render */
  state?: CardState;
  /**
   * Plain-text or markdown output for chat-based AI clients.
   * When present, MCP adapter returns this as the tool response text
   * (alongside HTML for MCP Apps-compatible clients).
   */
  textOutput?: string;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookContext {
  /** Incoming webhook payload */
  payload: Record<string, unknown>;
  /** Current card state */
  state: CardState;
}

export interface WebhookResult {
  /** Updated state */
  state?: CardState;
}

// ---------------------------------------------------------------------------
// Card Definition
// ---------------------------------------------------------------------------

export interface CardDefinition<S extends InputSchema = InputSchema> {
  /** Unique card name (kebab-case) */
  name: string;
  /** Human-readable description (critical — LLMs use this for tool selection) */
  description: string;
  /** Path to icon file (SVG preferred) */
  icon?: string;

  /** Input schema — also used to generate MCP tool parameters */
  inputs: S;

  /** Fetch data for rendering. Runs server-side on each card request. */
  getData: (context: GetDataContext<S>) => Promise<GetDataResult>;

  /** Named actions users (or AI agents) can trigger on this card */
  actions?: Record<string, ActionDefinition<S>>;

  /** Handle incoming webhook pushes */
  onWebhook?: (context: WebhookContext) => Promise<WebhookResult>;

  /**
   * Template for rendering the card UI.
   * - String ending in .hbs/.html → file path relative to card directory
   * - Function → receives viewModel, returns HTML string
   */
  template: string | ((viewModel: Record<string, unknown>) => string);
}

// ---------------------------------------------------------------------------
// Pack Definition
// ---------------------------------------------------------------------------

export interface PackDefinition {
  /** Pack name (kebab-case, e.g. "weather", "finance") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Version (semver) */
  version: string;
  /** Cards in this pack */
  cards: CardDefinition<any>[];
}

// ---------------------------------------------------------------------------
// Runtime interfaces (storage, analytics)
// ---------------------------------------------------------------------------

export interface StateStore {
  get(cardKey: string): Promise<CardState | null>;
  set(cardKey: string, state: CardState): Promise<void>;
  delete(cardKey: string): Promise<void>;
}

export interface AnalyticsProvider {
  track(event: string, properties: Record<string, unknown>): void;
}

export interface RuntimeConfig {
  /** Base URL for the card server */
  baseUrl?: string;
  /** State storage backend */
  stateStore?: StateStore;
  /** Analytics provider */
  analytics?: AnalyticsProvider;
}
