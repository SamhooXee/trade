import { describe, it, expect, vi } from 'vitest'
import { keyService } from './key-service'
import { SupabaseClient } from '@supabase/supabase-js'

describe('KeyService', () => {
  describe('generateKeyCode', () => {
    it('generates a formatted key code with hyphens', () => {
      const code = keyService.generateKeyCode()
      expect(code).toHaveLength(19) // 16 alphanumeric + 3 hyphens
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/)
    })

    it('generates different codes on subsequent calls', () => {
      const code1 = keyService.generateKeyCode()
      const code2 = keyService.generateKeyCode()
      expect(code1).not.toBe(code2)
    })
  })

  describe('generateUniqueKeyCode', () => {
    it('returns unique code when no collision occurs', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle })
      const mockFrom = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) })
      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient

      const code = await keyService.generateUniqueKeyCode(mockSupabase)
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/)
      expect(mockFrom).toHaveBeenCalledWith('trade260915a_keys')
    })
  })

  describe('generateKeys', () => {
    it('inserts generated keys with correct values', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle })
      const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'k1', code: 'A-B-C-D' }], error: null })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      
      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'trade260915a_keys') {
          return {
            select: vi.fn().mockReturnValue({ eq: mockEq }),
            insert: mockInsert,
          }
        }
        return {}
      })
      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient

      const result = await keyService.generateKeys(mockSupabase, {
        points: 500,
        expiresIn: 10,
        quantity: 2,
      })

      expect(mockInsert).toHaveBeenCalled()
      const insertedData = mockInsert.mock.calls[0][0]
      expect(insertedData).toHaveLength(2)
      expect(insertedData[0].points).toBe(500)
      expect(result).toHaveLength(1)
    })
  })
})
