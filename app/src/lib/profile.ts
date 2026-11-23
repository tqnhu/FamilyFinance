/** Rules and wording for the profile, password and family settings screens (kept pure so they can be tested). */

export const PASSWORD_MIN = 8
export const NAME_MAX = 40
export const FAMILY_NAME_MAX = 60

/** A message when the new password is not acceptable, otherwise null. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (!password.trim()) return 'A password cannot be only spaces.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

/** A message when a display or family name is not acceptable, otherwise null. */
export function nameProblem(raw: string, max = NAME_MAX, what = 'name'): string | null {
  const n = raw.trim()
  if (!n) return `Please type a ${what}.`
  if (n.length > max) return `A ${what} can have at most ${max} characters.`
  return null
}

/** The sentence for a set_username answer, or null when it worked. */
export function usernameMessage(answer: unknown): string | null {
  switch (answer) {
    case 'ok': return null
    case 'invalid': return 'Use 3 to 20 letters, numbers or underscores.'
    case 'taken': return 'That username is taken. Try another.'
    default: return 'Something went wrong. Please try again.'
  }
}

/** The sentence for a set_my_name / rename_family answer, or null when it worked. */
export function saveNameMessage(answer: unknown, what = 'name'): string | null {
  if (answer === 'ok') return null
  if (answer === 'invalid') return `That ${what} is not valid. Please check its length.`
  return 'Something went wrong. Please try again.'
}

/** Supabase limits how often a reset email can be requested for one address. */
export function isRateLimit(err: { status?: number; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.status === 429 || /rate limit|only request this after|too many/i.test(err.message ?? '')
}

/** What the forgot-password screen says. It is the same whether or not the account exists, so it cannot be used to find accounts. */
export const RESET_SENT = 'If an account exists for that email, a link to choose a new password is on its way. It can take a few minutes, so please check your spam folder too.'
export const RESET_WAIT = 'A reset email was requested a moment ago. Please wait a minute and try again.'

/** A ready-to-send invitation for a chat app. */
export function inviteText({ familyName, who, code, url }: { familyName: string; who: 'parent' | 'kid'; code: string; url: string }): string {
  return `Join ${familyName} on FamilyFinance.\n1. Open ${url}\n2. Create an account (or sign in)\n3. Choose "Join your family" and enter this ${who} code: ${code}`
}
