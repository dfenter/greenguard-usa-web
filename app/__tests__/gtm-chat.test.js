const path = require('path')
const fs = require('fs')

describe('gtm-mcp-server tool registry', () => {
  const EXPECTED_TOOLS = [
    'get_target',
    'gtm_pipeline',
    'hubspot_contact_notes',
    'hubspot_find_contacts',
    'list_docs',
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
    // Prevent main() from actually connecting/exiting during require.
    jest.spyOn(process, 'exit').mockImplementation(() => {})
    require('../scripts/gtm-mcp-server.js')
  })

  afterAll(() => {
    jest.dontMock('@modelcontextprotocol/sdk/server/mcp.js')
    jest.dontMock('@modelcontextprotocol/sdk/server/stdio.js')
    jest.restoreAllMocks()
  })

  test('registers exactly the expected read-only tool set', () => {
    expect([...registered].sort()).toEqual(EXPECTED_TOOLS)
  })

  test('no registered tool name looks mutating', () => {
    const mutatingPattern = /create|update|delete|write|upsert|add|set|send|post/i
    for (const name of registered) {
      expect(name).not.toMatch(mutatingPattern)
    }
  })
})

describe('chat-daemon gtm route', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'chat-daemon.js'), 'utf8')
  const m = src.match(/req\.url\.match\((\/\^\\\/chat\\\/\([^)]+\)\$\/)\)/)

  test('route regex is present in source', () => {
    expect(m).not.toBeNull()
  })

  function buildRegex() {
    // Extract the literal regex text between the first /^ and $/ and rebuild it.
    const literal = src.match(/const m = req\.url\.match\((\/\^[^\n]+\$\/)\)/)
    expect(literal).not.toBeNull()
    // eslint-disable-next-line no-eval
    return eval(literal[1])
  }

  test('accepts /chat/gtm', () => {
    expect(buildRegex().test('/chat/gtm')).toBe(true)
  })
  test('still accepts /chat/customer', () => {
    expect(buildRegex().test('/chat/customer')).toBe(true)
  })
  test('still accepts /chat/admin', () => {
    expect(buildRegex().test('/chat/admin')).toBe(true)
  })
  test('still accepts /chat/sparkbridge', () => {
    expect(buildRegex().test('/chat/sparkbridge')).toBe(true)
  })
  test('rejects /chat/other', () => {
    expect(buildRegex().test('/chat/other')).toBe(false)
  })

  test('gtm is not added to the sparkbridge CORS branch', () => {
    // The CORS grant must stay keyed on audience === 'sparkbridge' only.
    const corsLine = src.match(/const sbCors = audience === 'sparkbridge'[^\n]*/)
    expect(corsLine).not.toBeNull()
    expect(corsLine[0]).not.toMatch(/gtm/)
  })
})

describe('/api/gtm/chat gate ordering', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('a rejected gate means tryLocalChat is never called', async () => {
    jest.doMock('../lib/auth', () => ({
      requireGtm: jest.fn().mockResolvedValue(null),
    }))
    const tryLocalChat = jest.fn()
    jest.doMock('../lib/chat-local', () => ({
      tryLocalChat,
      STARTED_BUT_FAILED_REPLY: 'failed',
    }))

    const handler = require('../pages/api/gtm/chat').default
    const req = { method: 'POST', body: { message: 'hi', history: [] } }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), end: jest.fn() }

    await handler(req, res)

    expect(tryLocalChat).not.toHaveBeenCalled()
  })

  test('an allowed gate proceeds to tryLocalChat', async () => {
    jest.doMock('../lib/auth', () => ({
      requireGtm: jest.fn().mockResolvedValue({ email: 'mba@greenguard-usa.com' }),
    }))
    const tryLocalChat = jest.fn().mockResolvedValue({ ok: true, reply: 'answer' })
    jest.doMock('../lib/chat-local', () => ({
      tryLocalChat,
      STARTED_BUT_FAILED_REPLY: 'failed',
    }))

    const handler = require('../pages/api/gtm/chat').default
    const req = { method: 'POST', body: { message: 'hi', history: [] } }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), end: jest.fn() }

    await handler(req, res)

    expect(tryLocalChat).toHaveBeenCalledTimes(1)
    expect(tryLocalChat.mock.calls[0][0]).toMatchObject({ audience: 'gtm', email: 'mba@greenguard-usa.com', message: 'hi' })
  })
})
