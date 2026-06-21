import { randomBytes } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

export interface Key {
  id: string
  code: string
  points: number
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
  expires_at: string
  created_at: string
  redeemed_at: string | null
  user_id: string | null
  profile?: {
    email: string | null
  } | null
}

export class KeyService {
  /**
   * Generate a cryptographically secure random key code
   * Format: ABCD-EFGH-IJKL-MNOP (base32 with hyphens)
   */
  generateKeyCode(): string {
    const bytes = randomBytes(10)
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let result = ''
    
    for (let i = 0; i < bytes.length; i += 5) {
      const chunk = bytes.subarray(i, Math.min(i + 5, bytes.length))
      let value = 0
      for (let j = 0; j < chunk.length; j++) {
        value = (value << 8) | chunk[j]
      }
      
      const bitsInChunk = chunk.length * 8
      const charsInChunk = Math.ceil(bitsInChunk / 5)
      
      for (let j = charsInChunk - 1; j >= 0; j--) {
        const index = value & 0x1f
        result = base32Chars[index] + result
        value >>= 5
      }
    }
    
    const keyCode = result.substring(0, 16)
    return `${keyCode.substring(0, 4)}-${keyCode.substring(4, 8)}-${keyCode.substring(8, 12)}-${keyCode.substring(12, 16)}`
  }

  /**
   * Generate a unique key code with collision retry logic
   */
  async generateUniqueKeyCode(supabase: SupabaseClient): Promise<string> {
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateKeyCode()
      const { data, error } = await supabase
        .from('block1_keys')
        .select('id')
        .eq('code', code)
        .maybeSingle()

      if (!data && !error) {
        return code
      }
    }
    throw new Error('Failed to generate unique key code after maximum attempts')
  }

  /**
   * Generate multiple unique activation keys
   */
  async generateKeys(
    supabase: SupabaseClient,
    params: { points?: number; expiresIn?: number; quantity?: number } = {}
  ): Promise<Key[]> {
    const { points = 100, expiresIn = 30, quantity = 1 } = params

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresIn)

    const keysToInsert = []
    for (let i = 0; i < quantity; i++) {
      const code = await this.generateUniqueKeyCode(supabase)
      keysToInsert.push({
        code,
        points,
        status: 'ACTIVE',
        expires_at: expiresAt.toISOString(),
      })
    }

    const { data, error } = await supabase
      .from('block1_keys')
      .insert(keysToInsert)
      .select()

    if (error) {
      throw new Error(`Failed to generate keys: ${error.message}`)
    }

    return data as Key[]
  }

  /**
   * Delete an activation key by ID
   */
  async deleteKey(supabase: SupabaseClient, id: string): Promise<boolean> {
    const { error } = await supabase
      .from('block1_keys')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete key: ${error.message}`)
    }
    return true
  }
}

export const keyService = new KeyService()
