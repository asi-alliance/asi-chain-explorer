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
  schemes: Array<"http" | "https" | "ws" | "wss">;
  required: boolean;
  fallback: string;
}

const FIELDS: Record<keyof PublicConfig, Field> = {
  graphqlUrl: { key: 'REACT_APP_GRAPHQL_URL', schemes: ['http', 'https'], required: true, fallback: '' },
  graphqlWsUrl: { key: 'REACT_APP_GRAPHQL_WS_URL', schemes: ['ws', 'wss'], required: true, fallback: '' },
  indexerApiUrl: { key: 'REACT_APP_INDEXER_API_URL', schemes: ['http', 'https'], required: false, fallback: '/api/indexer' },
  nodeUrl: { key: 'REACT_APP_RCHAIN_NODE_URL', schemes: ['http', 'https'], required: false, fallback: '' },
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

// The grammar of docker/write-runtime-config.sh, so that the container and the
// browser accept the same values (scripts/runtime-config-cases.tsv). No quotes,
// backslashes, angle brackets, whitespace, credentials, query or fragment.
const SAFE_URL = /^[A-Za-z0-9._~:/[\]@!$&()*+,;=%-]+$/;
// A name whose last label is a number (all digits or 0x...) would be parsed as
// IPv4, so it must be a valid dotted address instead.
const LAST_LABEL = '([A-Za-z_-][A-Za-z0-9_-]*|[1-9][A-Za-z0-9_-]*[A-Za-z_-][A-Za-z0-9_-]*|0[A-WYZa-wyz_-][A-Za-z0-9_-]*|0[0-9][A-Za-z0-9_-]*[A-Za-z_-][A-Za-z0-9_-]*)';
const OCTET = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const H16 = '[0-9A-Fa-f]{1,4}';
const IPV6 = [
  `(${H16}:){7}${H16}`, `(${H16}:){1,7}:`, `(${H16}:){1,6}:${H16}`, `(${H16}:){1,5}(:${H16}){1,2}`,
  `(${H16}:){1,4}(:${H16}){1,3}`, `(${H16}:){1,3}(:${H16}){1,4}`, `(${H16}:){1,2}(:${H16}){1,5}`,
  `${H16}:(:${H16}){1,6}`, `:((:${H16}){1,7}|:)`,
].join('|');
const HOST = `(([A-Za-z0-9_-]*\\.)*${LAST_LABEL}\\.?|(${OCTET}\\.){3}${OCTET}|\\[(${IPV6})\\])`;
const PORT = '(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?';
const PATH = '(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?';
const RELATIVE = '/([A-Za-z0-9._~!$&()*+,;=:@%-][A-Za-z0-9._~!$&()*+,;=:@%/-]*)?';

function grammar(schemes: string[]): RegExp {
  return new RegExp(`^((${schemes.join('|')})://${HOST}${PORT}${PATH}|${RELATIVE})$`);
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid explorer configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

function validate(field: Field, value: string): string | null {
  if (!SAFE_URL.test(value)) return `${field.key} contains characters that are not allowed in a URL`;
  if (value.startsWith('//')) return `${field.key} must not be a protocol-relative URL`;
  const schemes = field.schemes.join(' or ');
  if (!value.startsWith('/')) {
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)?.[1];
    if (scheme === undefined) return `${field.key} must be an absolute ${schemes} URL or a path starting with /`;
    if (!(field.schemes as string[]).includes(scheme)) return `${field.key} must use ${schemes} (lowercase), not ${scheme}`;
    if (value.slice(scheme.length + 3).split('/')[0].includes('@')) return `${field.key} must not contain credentials`;
  }
  if (!grammar(field.schemes).test(value)) {
    return `${field.key} must be a ${schemes} URL with a host and an optional port 1-65535, or a path starting with /`;
  }
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
