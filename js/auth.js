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

window.MockoAuth = {
  signUp, signIn, signOut, getUser, signInWithGoogle, signInWithLinkedIn,
  resetPassword, updatePassword, updateEmail,
};
