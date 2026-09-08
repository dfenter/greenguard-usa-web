const fs = require('fs')
const path = require('path')
const os = require('os')

describe('OPS operator targets CSV parses correctly', () => {
  const csvPath = '/Users/lucille/Documents/GreenGuard/company-run-by-claude/gtm/06-targets/operator-targets.csv'
  const EXPECTED_COLUMNS = [
    'firm', 'person', 'email', 'email_confidence', 'phone', 'vertical', 'size',
    'cadence', 'current_stack', 'source', 'status', 'approve', 'dan_notes',
    's1', 's2', 's3', 's4', 's5', 's6', 's7',
  ]

  // Same minimal RFC4180 parser as gtm-mcp-server.js, duplicated here so this
  // test does not need to load the MCP server module (which requires the
  // live snapshot dir to exist).
  function parseCsv(text) {
    const rows = []
    let row = [], field = '', inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = false
        } else field += c
      } else if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field); field = ''
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(field); field = ''
        rows.push(row); row = []
      } else {
        field += c
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row) }
    if (!rows.length) return []
    const header = rows[0]
    return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
      const obj = {}
      header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : '' })
      return obj
    })
  }

  test('bundle CSV file exists', () => {
    expect(fs.existsSync(csvPath)).toBe(true)
  })

  test('parses to 43 rows with the expected columns', () => {
    const text = fs.readFileSync(csvPath, 'utf8')
    const header = text.split('\n')[0].split(',')
    expect(header).toEqual(EXPECTED_COLUMNS)
    const rows = parseCsv(text)
    expect(rows.length).toBe(43)
    for (const row of rows) {
      for (const col of EXPECTED_COLUMNS) {
        expect(Object.prototype.hasOwnProperty.call(row, col)).toBe(true)
      }
    }
  })
})

describe('gtm-mcp-server OPS tools', () => {
  const EXPECTED_TOOLS = [
    'get_ops_target',
    'get_target',
    'gtm_pipeline',
    'hubspot_contact_notes',
    'hubspot_find_contacts',
    'list_docs',
    'list_ops_targets',
    'list_targets',
    'read_doc',
    'search_docs',
  ].sort()

  let registered

  beforeAll(() => {
    registered = []
    jest.resetModules()
    jest.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: jest.fn().mockImplementation(() => ({
        registerTool: (name) => { registered.push(name) },
        connect: jest.fn(),
      })),
    }))
    jest.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: jest.fn().mockImplementation(() => ({})),
    }))
    jest.spyOn(process, 'exit').mockImplementation(() => {})
    require('../scripts/gtm-mcp-server.js')
  })

  afterAll(() => {
    jest.dontMock('@modelcontextprotocol/sdk/server/mcp.js')
    jest.dontMock('@modelcontextprotocol/sdk/server/stdio.js')
    jest.restoreAllMocks()
  })

  test('registers list_ops_targets and get_ops_target alongside the existing tool set', () => {
    expect([...registered].sort()).toEqual(EXPECTED_TOOLS)
  })
})

describe('chat-daemon gtm prompt covers both products', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'chat-daemon.js'), 'utf8')
  const m = src.match(/const GTM_SYSTEM = \(\) => `([\s\S]*?)`\n/)

  test('GTM_SYSTEM function is present', () => {
    expect(m).not.toBeNull()
  })

  const prompt = m ? m[1] : ''

  test('mentions SparkBridge', () => {
    expect(prompt).toMatch(/SparkBridge/)
  })

  test('mentions One Person Show / OPS', () => {
    expect(prompt).toMatch(/One Person Show/)
    expect(prompt).toMatch(/\bOPS\b/)
  })

  test('instructs never to write "One Man Show" (as a warning, not an actual usage)', () => {
    expect(prompt).toMatch(/never write "One Man Show"/i)
  })

  test('states the OPS trade-neutral rule', () => {
    expect(prompt).toMatch(/consumables/)
    expect(prompt).toMatch(/vehicle/)
  })

  test('no em dash characters in the prompt', () => {
    expect(prompt).not.toMatch(/—/)
  })
})
