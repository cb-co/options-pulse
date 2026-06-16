export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          created_at?: string
        }
      }
      watchlist_items: {
        Row: {
          id: string
          user_id: string
          ticker: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ticker: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ticker?: string
          created_at?: string
        }
      }
      option_snapshots: {
        Row: {
          id: string
          snapshot_date: string
          ticker: string
          contract_symbol: string
          expiration: string
          strike: number
          option_type: string
          volume: number | null
          open_interest: number | null
          implied_volatility: number | null
          last_price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          snapshot_date: string
          ticker: string
          contract_symbol: string
          expiration: string
          strike: number
          option_type: string
          volume?: number | null
          open_interest?: number | null
          implied_volatility?: number | null
          last_price?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          snapshot_date?: string
          ticker?: string
          contract_symbol?: string
          expiration?: string
          strike?: number
          option_type?: string
          volume?: number | null
          open_interest?: number | null
          implied_volatility?: number | null
          last_price?: number | null
          created_at?: string
        }
      }
      digests: {
        Row: {
          id: string
          digest_date: string
          ticker: string
          unusualness_score: number | null
          signals: Json | null
          narrative: string | null
          created_at: string
        }
        Insert: {
          id?: string
          digest_date: string
          ticker: string
          unusualness_score?: number | null
          signals?: Json | null
          narrative?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          digest_date?: string
          ticker?: string
          unusualness_score?: number | null
          signals?: Json | null
          narrative?: string | null
          created_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
