export type StepId = 'expense' | 'budgets' | 'invite' | 'allowance' | 'bill' | 'install' | 'jars'
export type Step = {
  id: StepId; title: string; help: string; done: boolean
  /** Optional steps are suggestions: they never block the checklist from finishing. */
  optional: boolean
  to?: string
  action?: 'add-expense' | 'confirm-budgets' | 'install'
}

/** Everything the checklist needs to know, gathered by the screen. */
export type Facts = {
  role: 'parent' | 'child'
  expenses: number          // expenses this person can see, ever
  members: number           // people in the family
  children: number          // children in the family
  allowances: number        // children with a weekly allowance set
  bills: number
  budgetsChanged: boolean   // the starting budgets were edited
  budgetsConfirmed: boolean // a parent said "these look right"
  standalone: boolean       // already running as an installed app
  jarsVisited: boolean
}

/** The budgets a new family starts with (the categories made by create_family). */
export const DEFAULT_BUDGETS: Record<string, number> = {
  'Groceries': 40000, 'Eating out': 10000, 'Transport': 10000, 'Home & bills': 0, 'Health': 0, 'Fun': 8000, 'Kids': 5000, 'Other': 0,
}

/** True once the starting categories or amounts were edited, added to or removed. */
export function budgetsChanged(cats: { name: string; budget_cents: number; archived?: boolean }[]): boolean {
  if (cats.length !== Object.keys(DEFAULT_BUDGETS).length) return true
  return cats.some(c => c.archived || DEFAULT_BUDGETS[c.name] !== c.budget_cents)
}

export function checklistSteps(f: Facts): Step[] {
  const install: Step = { id: 'install', title: 'Add the app to your home screen', optional: true, done: f.standalone, action: 'install',
    help: 'It opens like an app and stays one tap away.' }
  if (f.role === 'child') {
    return [
      { id: 'expense', title: 'Log your first expense', optional: false, done: f.expenses > 0, action: 'add-expense', help: 'Tap + and add something you bought. It takes three taps.' },
      { id: 'jars', title: 'Look at your three jars', optional: false, done: f.jarsVisited, to: '/jars', help: 'Spend, Save and Give: see how much is in each.' },
      install,
    ]
  }
  const steps: Step[] = [
    { id: 'expense', title: 'Add your first expense', optional: false, done: f.expenses > 0, action: 'add-expense', help: 'Tap + and add something you bought today. It takes three taps.' },
    { id: 'budgets', title: 'Check your monthly budgets', optional: false, done: f.budgetsChanged || f.budgetsConfirmed, to: '/plan', action: 'confirm-budgets',
      help: 'We set starting amounts for you. Change them to fit your family, or confirm they look right.' },
    { id: 'invite', title: 'Invite your partner or kids', optional: false, done: f.members > 1, to: '/settings?tab=family',
      help: 'Share a code from Settings → Family, so they can join and log their own spending.' },
  ]
  if (f.children > 0) {
    steps.push({ id: 'allowance', title: "Set up a child's allowance", optional: false, done: f.allowances > 0, to: '/jars',
      help: 'Choose a weekly amount and how it splits into Spend, Save and Give.' })
  }
  steps.push({ id: 'bill', title: 'Add a bill you pay regularly', optional: true, done: f.bills > 0, to: '/plan?tab=bills',
    help: 'Insurance, subscriptions and so on. You will see when each is due.' })
  steps.push(install)
  return steps
}

/** Progress counts only the steps that are not optional. */
export function progress(steps: Step[]): { done: number; total: number; complete: boolean } {
  const required = steps.filter(s => !s.optional)
  const done = required.filter(s => s.done).length
  return { done, total: required.length, complete: done === required.length }
}

export const startHiddenKey = (userId: string) => `ff:start-hidden:${userId}`
export const budgetsConfirmedKey = (userId: string) => `ff:budgets-ok:${userId}`
export const jarsVisitedKey = (userId: string) => `ff:jars-visited:${userId}`
