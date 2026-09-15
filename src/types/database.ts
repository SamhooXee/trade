// Supabase generated database types. 手工维护 (未用 supabase gen types)。
// 当 schema 变化时同步更新这里。

export interface Database {
  public: {
    Tables: {
      trade260915a_quant_symbols: {
        Row: {
          code: string
          market: 'SH' | 'SZ'
          name: string
          list_date: string
          delist_date: string | null
          is_mainboard: boolean
          updated_at: string
        }
        Insert: {
          code: string
          market: 'SH' | 'SZ'
          name: string
          list_date: string
          delist_date?: string | null
          is_mainboard?: boolean
        }
        Update: Partial<{
          code: string
          market: 'SH' | 'SZ'
          name: string
          list_date: string
          delist_date: string | null
          is_mainboard: boolean
          updated_at: string
        }>
      }
      trade260915a_quant_daily_bars: {
        Row: {
          symbol_code: string
          trade_date: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }
        Insert: {
          symbol_code: string
          trade_date: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }
        Update: Partial<{
          symbol_code: string
          trade_date: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }>
      }
      trade260915a_quant_minute_bars: {
        Row: {
          symbol_code: string
          trade_date: string
          trade_time: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }
        Insert: {
          symbol_code: string
          trade_date: string
          trade_time: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }
        Update: Partial<{
          symbol_code: string
          trade_date: string
          trade_time: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          amount: number
        }>
      }
      trade260915a_quant_ingest_state: {
        Row: {
          data_type: 'daily' | 'minute'
          last_synced_at: string
        }
        Insert: {
          data_type: 'daily' | 'minute'
          last_synced_at: string
        }
        Update: Partial<{
          data_type: 'daily' | 'minute'
          last_synced_at: string
        }>
      }
      trade260915a_strategies: {
        Row: {
          id: string
          user_id: string
          name: string
          spec: unknown
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          spec: unknown
          status?: 'draft' | 'active' | 'paused' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          name: string
          spec: unknown
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}