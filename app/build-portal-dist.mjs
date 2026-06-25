#!/usr/bin/env node
// Pre-compile portal components for design-sync.
// Bundles each component with Next.js stubs and React externalized.
// Output: dist/portal-entry.js (ESM, React external)

import { build } from '/Users/lucille/greenguard-usa-web/app/.ds-sync/node_modules/esbuild/lib/main.js'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dir, 'dist')

const COMPONENTS = [
  'AdminChat',
  'AppointmentDetailDock',
  'CustomerChat',
  'CustomerMap',
  'CustomerPanel',
  'PortalLayout',
  'SignaturePad',
  'StopCard',
  'TankCalendar',
]

// Stub files (written next to source, cleaned up after build)
const STUBS = {
  '_next_link_stub.jsx': `
import React from 'react'
export default function Link({ href, children, ...props }) {
  return React.createElement('a', { href, ...props }, children)
}
`,
  '_next_router_stub.js': `
export function useRouter() {
  return { pathname: '/', query: {}, push: () => {}, back: () => {}, replace: () => {} }
}
export default { useRouter }
`,
}

for (const [name, code] of Object.entries(STUBS)) {
  writeFileSync(resolve(__dir, name), code)
}

const nextStubPlugin = {
  name: 'next-stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: resolve(__dir, '_next_link_stub.jsx'),
    }))
    build.onResolve({ filter: /^next\/router$/ }, () => ({
      path: resolve(__dir, '_next_router_stub.js'),
    }))
    // Prevent any other next/* from being bundled (server internals)
    build.onResolve({ filter: /^next\// }, () => ({
      path: 'next-stub-empty',
      namespace: 'empty-stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'empty-stub' }, () => ({
      contents: 'export default {}',
      loader: 'js',
    }))
  },
}

// Barrel entry
const barrelPath = resolve(__dir, '_portal_barrel.jsx')
writeFileSync(
  barrelPath,
  COMPONENTS.map(c => `export { default as ${c} } from './components/${c}.js'`).join('\n') + '\n',
)

mkdirSync(DIST, { recursive: true })

await build({
  entryPoints: [barrelPath],
  format: 'esm',
  outfile: resolve(DIST, 'portal-entry.js'),
  bundle: true,
  loader: { '.js': 'jsx' },
  jsx: 'automatic',
  jsxImportSource: 'react',
  // Externalize React — the design-sync converter's runtime provides it
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  // Replace process.env.* so the || fallbacks work in the browser preview
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_BIZ_NAME': 'undefined',
    'process.env.NEXT_PUBLIC_BIZ_TAGLINE': 'undefined',
    'process.env.NEXT_PUBLIC_BIZ_CITY': 'undefined',
    'process.env.NEXT_PUBLIC_BIZ_SYSTEM_IMAGES': 'undefined',
    'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': 'undefined',
    'process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID': 'undefined',
    'process.env.NEXT_PUBLIC_APP_URL': 'undefined',
  },
  plugins: [nextStubPlugin],
  target: 'es2020',
  platform: 'browser',
})

// Cleanup temp files
for (const name of Object.keys(STUBS)) {
  rmSync(resolve(__dir, name), { force: true })
}
rmSync(barrelPath, { force: true })

console.log('✓ dist/portal-entry.js built with', COMPONENTS.length, 'components')
