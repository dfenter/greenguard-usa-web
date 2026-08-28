#!/usr/bin/env node
// ops/skills/build.js — render tenant skill files + CLAUDE.md from templates.
//
// Usage: node ops/skills/build.js <tenantId> [--out DIR]
//
// Reads app/lib/businesses/<tenantId>/config.js and every template in
// ops/skills/templates/*.md (plus ops/CLAUDE.md.tmpl), substitutes
// {{token}} placeholders, and writes:
//   <out>/<tenantId>-<skillname>.md   for each ops/skills/templates/<skillname>.md
//   app/lib/businesses/<id>/CLAUDE.md rendered from ops/CLAUDE.md.tmpl + policy.yaml
//
// No dependencies — plain Node (fs/path only). A tiny hand-rolled YAML
// reader is used for policy.yaml / business.yaml since we don't want a
// third-party dep for this build step.

'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { out: path.join(process.env.HOME || '.', '.claude', 'commands') };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      args.out = argv[++i];
    } else {
      positional.push(a);
    }
  }
  args.tenantId = positional[0];
  return args;
}

// ---------------------------------------------------------------------------
// Minimal YAML reader: enough for the flat/nested-map structure used by
// policy.yaml.example and business.yaml (no lists-of-maps, no anchors).
// ---------------------------------------------------------------------------
function parseSimpleYaml(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -1, node: root }];

  for (let rawLine of lines) {
    // strip full-line comments and trailing comments (naive: only if '#' has
    // a preceding space, to avoid eating '#' inside quoted strings we don't
    // otherwise support)
    let line = rawLine.replace(/\r$/, '');
    const commentIdx = line.search(/\s#/);
    let content = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    if (!content.trim()) continue;
    if (/^\s*#/.test(content)) continue;

    const indent = content.match(/^(\s*)/)[1].length;
    const trimmed = content.trim();

    // list item
    const listMatch = trimmed.match(/^-\s+(.*)$/);
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;

    if (listMatch) {
      // find the key this list belongs to: last key set on parent at this level
      const key = parent.__lastListKey;
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push(coerceScalar(listMatch[1].trim()));
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2];

    if (value === '' || value === undefined) {
      // could be a nested map or an upcoming list
      const node = {};
      parent[key] = node;
      parent.__lastListKey = key;
      stack.push({ indent, node });
    } else {
      parent[key] = coerceScalar(value.trim());
    }
  }

  // strip helper markers
  stripListKeyMarkers(root);
  return root;
}

function stripListKeyMarkers(obj) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    delete obj.__lastListKey;
    for (const k of Object.keys(obj)) stripListKeyMarkers(obj[k]);
  }
}

function coerceScalar(v) {
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => coerceScalar(s.trim()));
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(overlay)) {
    const ov = overlay[key];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Token substitution
// ---------------------------------------------------------------------------
function buildTokenMap(config) {
  const infra = config.infra || {};
  return {
    name: config.name,
    nameShort: config.nameShort,
    email: config.email,
    ownerEmail: config.ownerEmail,
    phone: config.phone,
    city: config.city,
    website: config.website,
    depot: (config.depot && config.depot.full) || '',
    taxRate: config.taxRate,
    bookingTag: config.bookingTag,
    id: config.id,
    industry: config.industry,
    calendarId: config.calendarId,
    vercelProjectId: infra.vercelProjectId || 'SET-ME',
    ga4Id: infra.ga4Id || 'SET-ME',
    metaPixelId: infra.metaPixelId || 'SET-ME',
    gbpPlaceId: infra.gbpPlaceId || 'SET-ME',
    renderServiceId: infra.renderServiceId || 'SET-ME',
  };
}

function renderTemplate(templateText, tokens, filename) {
  const missing = [];
  const rendered = templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, tokenName) => {
    if (!(tokenName in tokens) || tokens[tokenName] === undefined || tokens[tokenName] === null) {
      missing.push(tokenName);
      return match;
    }
    return String(tokens[tokenName]);
  });
  if (missing.length) {
    const unique = [...new Set(missing)];
    throw new Error(`Unknown token(s) in ${filename}: ${unique.map((t) => `{{${t}}}`).join(', ')}`);
  }
  return rendered;
}

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------
function resolvePolicy(tenantDir) {
  const opsDir = path.join(__dirname, '..');
  const examplePath = path.join(opsDir, 'policy.yaml.example');
  const exampleYaml = fs.readFileSync(examplePath, 'utf8');
  const exampleParsed = parseSimpleYaml(exampleYaml);
  let policy = exampleParsed.policy || exampleParsed;

  const businessYamlPath = path.join(tenantDir, 'business.yaml');
  if (fs.existsSync(businessYamlPath)) {
    const overlay = parseSimpleYaml(fs.readFileSync(businessYamlPath, 'utf8'));
    if (overlay.policy) {
      policy = deepMerge(policy, overlay.policy);
    }
  }
  return policy;
}

function renderPolicySection(policy) {
  const lines = ['## Policy', '', 'Rendered from `policy.yaml` (tenant overlay, if any, merged over `ops/policy.yaml.example` defaults).', ''];
  const dump = (obj, indent) => {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const pad = '  '.repeat(indent);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        lines.push(`${pad}- **${key}**:`);
        dump(val, indent + 1);
      } else if (Array.isArray(val)) {
        lines.push(`${pad}- **${key}**: ${val.join(', ')}`);
      } else {
        lines.push(`${pad}- **${key}**: ${val}`);
      }
    }
  };
  dump(policy, 0);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { tenantId, out } = parseArgs(process.argv.slice(2));
  if (!tenantId) {
    console.error('Usage: node ops/skills/build.js <tenantId> [--out DIR]');
    process.exit(1);
  }

  const opsDir = __dirname.replace(/\/skills$/, '');
  const appDir = path.join(opsDir, '..', 'app');
  const tenantDir = path.join(appDir, 'lib', 'businesses', tenantId);
  const configPath = path.join(tenantDir, 'config.js');

  if (!fs.existsSync(configPath)) {
    console.error(`No tenant config found at ${configPath}`);
    process.exit(1);
  }

  // require() the config directly by absolute path, per spec
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);

  const tokens = buildTokenMap(config);
  const outDir = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
  fs.mkdirSync(outDir, { recursive: true });

  const templatesDir = path.join(opsDir, 'skills', 'templates');
  const templateFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.md')).sort();

  let count = 0;
  for (const file of templateFiles) {
    const skillName = file.replace(/\.md$/, '');
    const templatePath = path.join(templatesDir, file);
    const templateText = fs.readFileSync(templatePath, 'utf8');
    const rendered = renderTemplate(templateText, tokens, file);
    const outPath = path.join(outDir, `${tenantId}-${skillName}.md`);
    fs.writeFileSync(outPath, rendered, 'utf8');
    count++;
  }

  // Render CLAUDE.md.tmpl -> app/lib/businesses/<id>/CLAUDE.md (the tenant's
  // repo-level instructions), never into the skills dir: ~/.claude/commands
  // would otherwise expose it as a bogus "CLAUDE" slash command.
  const claudeTmplPath = path.join(opsDir, 'CLAUDE.md.tmpl');
  if (fs.existsSync(claudeTmplPath)) {
    const claudeTmplText = fs.readFileSync(claudeTmplPath, 'utf8');
    const policy = resolvePolicy(tenantDir);
    const policySection = renderPolicySection(policy);
    const withPolicy = claudeTmplText.replace(/\{\{\s*policySection\s*\}\}/g, policySection);
    const rendered = renderTemplate(withPolicy, tokens, 'CLAUDE.md.tmpl');
    fs.writeFileSync(path.join(tenantDir, 'CLAUDE.md'), rendered, 'utf8');
    console.log(`Wrote ${path.join(tenantDir, 'CLAUDE.md')}`);
    count++;
  }

  console.log(`Built ${count} files for tenant "${tenantId}" -> ${outDir}`);
}

main();
