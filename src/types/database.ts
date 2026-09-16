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
          spec: Record<string, unknown>
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          name: string
          spec: Record<string, unknown>
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }
        Update: Partial<{
          id: string
          user_id: string
          name: string
          spec: Record<string, unknown>
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }>
      }
      trade260915a_portfolios: {
        Row: {
          id: string
          user_id: string
          strategy_id: string
          cash: number
          initial_cash: number
          status: 'active' | 'paused' | 'stopped'
          stop_reason: string | null
          started_at: string
          stopped_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          strategy_id: string
          cash?: number
          initial_cash?: number
          status?: 'active' | 'paused' | 'stopped'
          stop_reason?: string | null
          started_at?: string
          stopped_at?: string | null
        }
        Update: Partial<{
          id: string
          user_id: string
          strategy_id: string
          cash: number
          initial_cash: number
          status: 'active' | 'paused' | 'stopped'
          stop_reason: string | null
          started_at: string
          stopped_at: string | null
        }>
      }
      trade260915a_positions: {
        Row: {
          id: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          shares: number
          available_shares: number
          cost_price: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          shares?: number
          available_shares?: number
          cost_price: number
          updated_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          shares: number
          available_shares: number
          cost_price: number
          updated_at: string
        }>
      }
      trade260915a_orders: {
        Row: {
          id: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          shares: number
          intended_price: number
          trade_date: string
          status: 'pending' | 'filled' | 'rejected' | 'cancelled'
          reject_reason: string | null
          submitted_at: string
          filled_at: string | null
          filled_price: number | null
          filled_shares: number | null
          fee: number | null
        }
        Insert: {
          id?: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          shares: number
          intended_price: number
          trade_date: string
          status?: 'pending' | 'filled' | 'rejected' | 'cancelled'
          reject_reason?: string | null
          submitted_at?: string
          filled_at?: string | null
          filled_price?: number | null
          filled_shares?: number | null
          fee?: number | null
        }
        Update: Partial<{
          id: string
          user_id: string
          portfolio_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          shares: number
          intended_price: number
          trade_date: string
          status: 'pending' | 'filled' | 'rejected' | 'cancelled'
          reject_reason: string | null
          submitted_at: string
          filled_at: string | null
          filled_price: number | null
          filled_shares: number | null
          fee: number | null
        }>
      }
      trade260915a_fills: {
        Row: {
          id: string
          user_id: string
          portfolio_id: string
          order_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          price: number
          shares: number
          amount: number
          fee: number
          filled_at: string
        }
        Insert: {
          id?: string
          user_id: string
          portfolio_id: string
          order_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          price: number
          shares: number
          amount: number
          fee: number
          filled_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          portfolio_id: string
          order_id: string
          symbol_code: string
          side: 'BUY' | 'SELL'
          price: number
          shares: number
          amount: number
          fee: number
          filled_at: string
        }>
      }
      trade260915a_strategy_run_log: {
        Row: {
          id: string
          user_id: string
          portfolio_id: string
          trade_date: string
          run_at: string
          signals_count: number
          orders_count: number
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          portfolio_id: string
          trade_date: string
          run_at?: string
          signals_count?: number
          orders_count?: number
          notes?: string | null
        }
        Update: Partial<{
          id: string
          user_id: string
          portfolio_id: string
          trade_date: string
          run_at: string
          signals_count: number
          orders_count: number
          notes: string | null
        }>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}