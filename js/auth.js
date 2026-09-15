import { supabase } from './supabase-client.js';

let currentUser = null;

supabase.auth.getSession().then(({ data }) => {
  currentUser = data.session?.user ?? null;
  window.dispatchEvent(new CustomEvent('mocko-auth-change', { detail: currentUser }));
});

supabase.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;
  window.dispatchEvent(new CustomEvent('mocko-auth-change', { detail: currentUser }));
  if (event === 'PASSWORD_RECOVERY') {
    window.dispatchEvent(new CustomEvent('mocko-password-recovery'));
  }
});

async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function signOut() {
  await supabase.auth.signOut();
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
  if (error) throw error;
}

async function signInWithLinkedIn() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'linkedin_oidc' });
  if (error) throw error;
}

async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

async function updateEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
}

function getUser() {
  return currentUser;
}

function hasPasswordIdentity() {
  return !!(currentUser?.identities || []).find((i) => i.provider === 'email');
}

// Deletes the signed-in user's account and all their data. Requires a
// re-entered password first (or, for an OAuth-only account with no
// password to check, typing "DELETE") so this destructive action can't be
// triggered by a stray click. Storage objects aren't relational, so they're
// removed here client-side before the DB row (and everything that cascades
// from it -- profile, sessions, resumes, drill scores) is deleted server-side
// by the delete_own_account() function.
async function deleteAccount({ password, confirmText } = {}) {
  const user = currentUser;
  if (!user) throw new Error('Not signed in');

  if (hasPasswordIdentity()) {
    if (!password) throw new Error('Enter your password to confirm.');
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (reauthError) throw new Error('Incorrect password.');
  } else if ((confirmText || '').trim().toUpperCase() !== 'DELETE') {
    throw new Error('Type DELETE to confirm.');
  }

  const buckets = ['avatars', 'banners', 'resumes', 'recordings'];
  for (const bucket of buckets) {
    const { data: files } = await supabase.storage.from(bucket).list(user.id);
    if (files && files.length) {
      await supabase.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
  }

  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

window.MockoAuth = {
  signUp, signIn, signOut, getUser, signInWithGoogle, signInWithLinkedIn,
  resetPassword, updatePassword, updateEmail, hasPasswordIdentity, deleteAccount,
};
