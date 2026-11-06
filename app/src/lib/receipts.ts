import { supabase } from './supabase'

const BUCKET = 'receipts'

/** Uploads a JPEG under <family>/<expense>/<random>.jpg and returns the stored path. */
export async function uploadReceipt(familyId: string, expenseId: string, jpeg: Blob): Promise<string> {
  const path = `${familyId}/${expenseId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

/** A short-lived link for showing a private photo. */
export async function receiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  return error ? null : data.signedUrl
}

/** Best effort: a leftover file is harmless, so failures are ignored. */
export async function removeReceipt(path: string | null | undefined): Promise<void> {
  if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* ignore */ }
}
