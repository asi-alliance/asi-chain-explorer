// Public endpoint configuration. The production image writes /config.js at
// container start (docker/write-runtime-config.sh); `npm start` and plain builds
// use the REACT_APP_* build values. Nothing here is a credential: every value is
// visible to every visitor.

export interface PublicConfig {
  graphqlUrl: string;
  graphqlWsUrl: string;
  indexerApiUrl: string;
  nodeUrl: string;
}

export type ConfigSource = Partial<Record<ConfigKey, string>>;

type ConfigKey =
  | 'REACT_APP_GRAPHQL_URL'
  | 'REACT_APP_GRAPHQL_WS_URL'
  | 'REACT_APP_INDEXER_API_URL'
  | 'REACT_APP_RCHAIN_NODE_URL';

declare global {
  interface Window {
    __ASI_EXPLORER_CONFIG__?: ConfigSource;
  }
}

interface Field {
  key: ConfigKey;
  schemes: string[];
  required: boolean;
  fallback: string;
}

const FIELDS: Record<keyof PublicConfig, Field> = {
  graphqlUrl: { key: 'REACT_APP_GRAPHQL_URL', schemes: ['http:', 'https:'], required: true, fallback: '' },
  graphqlWsUrl: { key: 'REACT_APP_GRAPHQL_WS_URL', schemes: ['ws:', 'wss:'], required: true, fallback: '' },
  indexerApiUrl: { key: 'REACT_APP_INDEXER_API_URL', schemes: ['http:', 'https:'], required: false, fallback: '/api/indexer' },
  nodeUrl: { key: 'REACT_APP_RCHAIN_NODE_URL', schemes: ['http:', 'https:'], required: false, fallback: '' },
};

// Local development talks to a local indexer stack. A production bundle never
// falls back to these: a missing endpoint is a configuration error.
const DEVELOPMENT_DEFAULTS: ConfigSource =
  process.env.NODE_ENV === 'production'
    ? {}
    : {
        REACT_APP_GRAPHQL_URL: 'http://localhost:8080/v1/graphql',
        REACT_APP_GRAPHQL_WS_URL: 'ws://localhost:8080/v1/graphql',
      };

// Same characters as docker/write-runtime-config.sh: no quotes, backslashes,
// angle brackets, whitespace, query or fragment.
const SAFE_URL = /^[A-Za-z0-9._~:/[\]@!$&()*+,;=%-]+$/;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid explorer configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

function validate(field: Field, value: string): string | null {
  if (!SAFE_URL.test(value)) return `${field.key} contains characters that are not allowed in a URL`;
  if (value.startsWith('/')) {
    return value.startsWith('//') ? `${field.key} must not be a protocol-relative URL` : null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${field.key} must be an absolute ${field.schemes.join('//, ')}// URL or a path starting with /`;
  }
  if (!field.schemes.includes(url.protocol)) {
    return `${field.key} must use ${field.schemes.map(s => s.slice(0, -1)).join(' or ')}, not ${url.protocol.slice(0, -1)}`;
  }
  if (!url.hostname) return `${field.key} has no host`;
  if (url.username || url.password) return `${field.key} must not contain credentials`;
  return null;
}

function websocketUrl(value: string, origin: string): string {
  if (!value.startsWith('/')) return value;
  const url = new URL(value, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Resolves runtime, then build, then development values. Throws ConfigError listing every problem. */
export function resolvePublicConfig(
  runtime: ConfigSource | undefined,
  build: ConfigSource,
  origin: string,
  developmentDefaults: ConfigSource = DEVELOPMENT_DEFAULTS,
): PublicConfig {
  const problems: string[] = [];
  const config = {} as PublicConfig;
  (Object.keys(FIELDS) as Array<keyof PublicConfig>).forEach(name => {
    const field = FIELDS[name];
    const raw = [runtime?.[field.key], build[field.key], developmentDefaults[field.key]]
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .find(value => value !== '');
    if (raw === undefined) {
      if (field.required) problems.push(`${field.key} is not set`);
      config[name] = field.fallback;
      return;
    }
    const problem = validate(field, raw);
    if (problem) problems.push(problem);
    config[name] = raw;
  });
  if (problems.length > 0) throw new ConfigError(problems);
  config.graphqlWsUrl = websocketUrl(config.graphqlWsUrl, origin);
  return config;
}

// Each variable is named literally so create-react-app can substitute it.
function buildValues(): ConfigSource {
  return {
    REACT_APP_GRAPHQL_URL: process.env.REACT_APP_GRAPHQL_URL,
    REACT_APP_GRAPHQL_WS_URL: process.env.REACT_APP_GRAPHQL_WS_URL,
    REACT_APP_INDEXER_API_URL: process.env.REACT_APP_INDEXER_API_URL,
    REACT_APP_RCHAIN_NODE_URL: process.env.REACT_APP_RCHAIN_NODE_URL,
  };
}

/** The validated public configuration of this page. Throws ConfigError when it is unusable. */
export function getPublicConfig(): PublicConfig {
  const runtime = typeof window === 'undefined' ? undefined : window.__ASI_EXPLORER_CONFIG__;
  const origin = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
  return resolvePublicConfig(runtime, buildValues(), origin);
}
