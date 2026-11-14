/** What join_family answers with when it succeeds. */
const JOINED = new Set(['parent', 'child', 'already_in_this_family'])

/** A plain-language message for a join_family answer, or null when the person is now in the family. */
export function joinMessage(answer: unknown): string | null {
  if (typeof answer === 'string' && JOINED.has(answer)) return null
  switch (answer) {
    case 'invalid_code':
      return 'That code was not recognised. Codes are 12 letters and numbers. Please check it with the person who sent it. Parents and kids have different codes.'
    case 'too_many_attempts':
      return 'Too many tries in a short time. Please wait about an hour, then try again. If you are sure of the code, ask a parent to send it again.'
    case 'name_required':
      return 'Please type your name first.'
    case 'already_member':
      return 'This account is already part of a family that has information in it, so it cannot be moved. Sign out and use a different email address, or ask for help.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
