import { supabase } from './supabase-client.js';

function requireUser() {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  return user;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data || [];
}

const getFriends = () => rpc('get_friends');
const getFriendRequests = () => rpc('get_friend_requests');
const getFriendSuggestions = () => rpc('get_friend_suggestions');
const getFriendActivity = (limit = 40) => rpc('get_friend_activity', { p_limit: limit });

async function toggleActivityLike(eventKey) {
  const { data, error } = await supabase.rpc('toggle_activity_like', { p_event_key: eventKey });
  if (error) throw error;
  return data;
}

// Requests I've sent that haven't been answered yet -- lets suggestion cards
// show "Requested" instead of a live Add button after a reload.
async function getSentRequestIds() {
  const user = requireUser();
  const { data, error } = await supabase
    .from('friendships')
    .select('addressee_id')
    .eq('requester_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;
  return (data || []).map((r) => r.addressee_id);
}

async function sendFriendRequest(targetId) {
  const user = requireUser();
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: targetId });
  if (error) throw error;
}

async function acceptFriendRequest(requesterId) {
  const user = requireUser();
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;
}

// Covers declining an incoming request, cancelling one you sent, and
// unfriending -- all the same row, deleted from either side.
async function removeFriendship(otherId) {
  const user = requireUser();
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`);
  if (error) throw error;
}

window.MockoSocial = {
  getFriends, getFriendRequests, getFriendSuggestions, getFriendActivity, toggleActivityLike,
  getSentRequestIds, sendFriendRequest, acceptFriendRequest, removeFriendship,
};
