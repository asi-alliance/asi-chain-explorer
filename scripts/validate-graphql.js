#!/usr/bin/env node
// Validates every GraphQL operation in src/ against the schema that a Hasura
// endpoint exposes to the unauthenticated (public) role.
//
// Usage: node scripts/validate-graphql.js <graphql-endpoint>
//    or: HASURA_GRAPHQL_ENDPOINT=<graphql-endpoint> npm run validate:graphql
'use strict';

const fs = require('fs');
const path = require('path');
const { Source, buildClientSchema, getIntrospectionQuery, parse, validate } = require('graphql');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OPERATION_START = /`(\s*(?:query|mutation|subscription)\b[\s\S]*?)`/g;
const GQL_TEMPLATE = /(?:const\s+(\w+)\s*=\s*)?gql`([\s\S]*?)`/g;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx|js|jsx|graphql|gql)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function collectDocuments() {
  const named = new Map();
  const documents = [];
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    if (/\.(graphql|gql)$/.test(file)) {
      documents.push({ label: rel, file: rel, body: text });
      continue;
    }
    const gqlSpans = [];
    for (const match of text.matchAll(GQL_TEMPLATE)) {
      const label = `${rel}:${lineOf(text, match.index)}${match[1] ? ` ${match[1]}` : ''}`;
      const document = { label, file: rel, body: match[2] };
      if (match[1]) named.set(`${rel}#${match[1]}`, document).set(match[1], named.has(match[1]) ? null : document);
      documents.push(document);
      gqlSpans.push([match.index, match.index + match[0].length]);
    }
    for (const match of text.matchAll(OPERATION_START)) {
      if (gqlSpans.some(([start, end]) => match.index >= start && match.index < end)) continue;
      documents.push({ label: `${rel}:${lineOf(text, match.index)}`, file: rel, body: match[1] });
    }
  }
  return { named, documents };
}

function expand(document, named, seen = new Set()) {
  return document.body.replace(/\$\{\s*(\w+)\s*\}/g, (_, name) => {
    const target = named.get(`${document.file}#${name}`) || named.get(name);
    if (!target) throw new Error(`cannot resolve \${${name}}`);
    if (seen.has(target)) throw new Error(`circular reference through \${${name}}`);
    return expand(target, named, new Set(seen).add(target));
  });
}

// Apollo removes repeated fragment definitions that interpolation produces.
function withoutDuplicateFragments(ast) {
  const fragments = new Set();
  const definitions = ast.definitions.filter((definition) => {
    if (definition.kind !== 'FragmentDefinition') return true;
    if (fragments.has(definition.name.value)) return false;
    fragments.add(definition.name.value);
    return true;
  });
  return { ...ast, definitions };
}

async function fetchSchema(endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  if (!response.ok) throw new Error(`introspection failed: HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors) throw new Error(`introspection failed: ${result.errors.map((error) => error.message).join('; ')}`);
  return buildClientSchema(result.data);
}

async function main() {
  const endpoint = process.argv[2] || process.env.HASURA_GRAPHQL_ENDPOINT;
  if (!endpoint) {
    console.error('Usage: node scripts/validate-graphql.js <graphql-endpoint>');
    process.exit(2);
  }

  const schema = await fetchSchema(endpoint);
  const { named, documents } = collectDocuments();
  let checked = 0;
  let failed = 0;

  for (const document of documents) {
    let ast;
    try {
      ast = withoutDuplicateFragments(parse(new Source(expand(document, named), document.label)));
    } catch (error) {
      failed++;
      console.log(`FAIL ${document.label}\n     ${error.message}`);
      continue;
    }
    if (!ast.definitions.some((definition) => definition.kind === 'OperationDefinition')) continue;
    checked++;
    const errors = validate(schema, ast);
    if (errors.length > 0) {
      failed++;
      console.log(`FAIL ${document.label}`);
      for (const error of errors) console.log(`     ${error.message}`);
    } else {
      console.log(`ok   ${document.label}`);
    }
  }

  console.log(`\n${checked} operation document(s) checked against ${endpoint}, ${failed} failed.`);
  if (checked === 0) {
    console.error('No GraphQL operations found under src/.');
    process.exit(1);
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
