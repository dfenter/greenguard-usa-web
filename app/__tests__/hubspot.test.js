jest.mock('@hubspot/api-client', () => {
  const mockCreate = jest.fn()
  const mockUpdate = jest.fn()
  const mockSearch = jest.fn()

  return {
    Client: jest.fn().mockImplementation(() => ({
      crm: {
        contacts: {
          basicApi: { create: mockCreate, update: mockUpdate },
          searchApi: { doSearch: mockSearch },
        },
        objects: {
          notes: {
            basicApi: { create: mockCreate },
          },
        },
      },
    })),
    _mocks: { mockCreate, mockUpdate, mockSearch },
  }
})

const { Client, _mocks } = require('@hubspot/api-client')
const { addNote, countContactsByProperty } = require('../lib/hubspot')

beforeEach(() => jest.clearAllMocks())

describe('addNote', () => {
  test('calls notes.basicApi.create with correct properties and associations', async () => {
    _mocks.mockCreate.mockResolvedValue({ id: 'note_123' })
    await addNote('contact_456', 'Test note body')
    expect(_mocks.mockCreate).toHaveBeenCalledTimes(1)
    const arg = _mocks.mockCreate.mock.calls[0][0]
    expect(arg.properties.hs_note_body).toBe('Test note body')
    expect(arg.associations).toHaveLength(1)
    expect(arg.associations[0].to.id).toBe('contact_456')
    expect(arg.associations[0].types[0].associationCategory).toBe('HUBSPOT_DEFINED')
    expect(arg.associations[0].types[0].associationTypeId).toBe(202)
  })

  test('contactId is coerced to string', async () => {
    _mocks.mockCreate.mockResolvedValue({ id: 'note_999' })
    await addNote(12345, 'body')
    const arg = _mocks.mockCreate.mock.calls[0][0]
    expect(typeof arg.associations[0].to.id).toBe('string')
    expect(arg.associations[0].to.id).toBe('12345')
  })
})

describe('countContactsByProperty', () => {
  test('returns total from search API', async () => {
    _mocks.mockSearch.mockResolvedValue({ total: 42, results: [] })
    const count = await countContactsByProperty('system_type', 'Biogents-CO2')
    expect(count).toBe(42)
    expect(_mocks.mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filterGroups: [{
          filters: [{ propertyName: 'system_type', operator: 'EQ', value: 'Biogents-CO2' }],
        }],
      })
    )
  })

  test('returns 0 if total missing from response', async () => {
    _mocks.mockSearch.mockResolvedValue({ results: [] })
    expect(await countContactsByProperty('system_type', 'Mosqitter')).toBe(0)
  })

  test('returns 0 and does not throw if API call fails', async () => {
    _mocks.mockSearch.mockRejectedValue(new Error('HubSpot API error'))
    await expect(countContactsByProperty('system_type', 'Tank-Only')).resolves.toBe(0)
  })
})
