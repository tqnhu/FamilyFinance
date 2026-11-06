import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Bill = {
  id: string; name: string; category_id: string | null; amount_cents: number
  times_per_year: 1 | 2 | 4 | 12; due_month: number; due_day: number; archived: boolean; created_at: string
}
export type Payment = { id: string; bill_id: string; due_on: string; expense_id: string; expenses: { amount_cents: number; spent_on: string } | null }

export const FREQ: Record<number, string> = { 1: 'Once a year', 2: 'Every 6 months', 4: 'Every 3 months', 12: 'Every month' }
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate()
export const isoDate = (d: Date) => d.toLocaleDateString('sv')

/** The due dates of a bill within one calendar year, as YYYY-MM-DD. The day is clamped to short months (31st -> 28th). */
export function dueDates(b: Pick<Bill, 'times_per_year' | 'due_month' | 'due_day'>, year: number): string[] {
  const step = 12 / b.times_per_year
  const out: string[] = []
  for (let k = 0; k < b.times_per_year; k++) {
    const m0 = (b.due_month - 1 + k * step) % 12
    out.push(`${year}-${pad(m0 + 1)}-${pad(Math.min(b.due_day, daysIn(year, m0)))}`)
  }
  return out.sort()
}

export const yearlyCost = (b: Pick<Bill, 'amount_cents' | 'times_per_year'>) => b.amount_cents * b.times_per_year
/** A bill charged every month is ordinary monthly spending: it belongs in the budgets, not in "put aside". */
export const isMonthlyBill = (b: Pick<Bill, 'times_per_year'>) => b.times_per_year === 12

/** What to put aside each month so the bill never comes as a shock. */
export const monthlySetAside = (b: Pick<Bill, 'amount_cents' | 'times_per_year'>) => Math.round(yearlyCost(b) / 12)

export type Due = { bill: Bill; due: string; days: number; paid: Payment | null; overdue: boolean }

/**
 * Every due date of every active bill for `year`, with its payment (if any).
 * A date before the bill was created is skipped unless it was paid: we don't know it was missed.
 */
export function dueList(bills: Bill[], payments: Payment[], year: number, today = new Date()): Due[] {
  const t = isoDate(today)
  const out: Due[] = []
  for (const bill of bills) {
    const created = bill.created_at.slice(0, 10)
    for (const due of dueDates(bill, year)) {
      const paid = payments.find(p => p.bill_id === bill.id && p.due_on === due) ?? null
      if (bill.archived && !paid) continue
      if (!paid && due < created.slice(0, 8) + '01') continue
      const days = Math.round((new Date(due + 'T12:00:00').getTime() - new Date(t + 'T12:00:00').getTime()) / 86_400_000)
      out.push({ bill, due, days, paid, overdue: !paid && due < t })
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}

/** Unpaid bills that are overdue or due within `withinDays` days (looks into next year around December). */
export function upcoming(bills: Bill[], payments: Payment[], today = new Date(), withinDays = 30): Due[] {
  const y = today.getFullYear()
  return [...dueList(bills, payments, y, today), ...dueList(bills, payments, y + 1, today)]
    .filter(d => !d.paid && d.days <= withinDays)
}

export function useBills() {
  const [bills, setBills] = useState<Bill[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const [b, p] = await Promise.all([
      supabase.from('bills').select('*').order('name'),
      supabase.from('bill_payments').select('*, expenses(amount_cents, spent_on)'),
    ])
    if (b.error || p.error) setError((b.error ?? p.error)!.message)
    setBills((b.data ?? []) as Bill[]); setPayments((p.data ?? []) as unknown as Payment[]); setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { bills, payments, loading, error, reload }
}
