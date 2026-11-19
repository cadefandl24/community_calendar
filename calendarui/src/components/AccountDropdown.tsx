import { useAuth0 } from '@auth0/auth0-react';
import type { User } from '@auth0/auth0-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_URL } from '../lib/api';

// Same rules as the API (Services/UsernameRules.cs), checked here too so mistakes show up right away
const minUsernameLength = 3;
const maxUsernameLength = 30;
const usernamePattern = /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/;
type AccountProfile = { username: string; email: string | null };

export default function AccountDropdown({ user }: { user?: User }) {
  const { getAccessTokenSilently, logout } = useAuth0();
  const userId = user?.sub;
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const name = profile?.username || user?.nickname || user?.name || 'Account';
  const loadingProfile = Boolean(userId && !profile && !loadFailed);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch(`${API_URL}/api/account`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Profile request failed');
        const account: AccountProfile = await response.json();
        if (!controller.signal.aborted) setProfile(account);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [getAccessTokenSilently, userId]);

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || deleteDialogRef.current?.open) return;
      setIsOpen(false);
      if (containerRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || loadingProfile || saving) return;

    const username = (draftName ?? name).trim().replace(/^@/, '').toLowerCase();
    setSaved(false);
    if (username.length < minUsernameLength || username.length > maxUsernameLength) {
      setSaveError(`Usernames must be ${minUsernameLength} to ${maxUsernameLength} characters long.`);
      return;
    }
    if (!usernamePattern.test(username)) {
      setSaveError('Use only lowercase letters, numbers, dots and underscores, starting and ending with a letter or number.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_URL}/api/account/username`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        // e.g. "That username is taken." (409) or a rule the API checked (400)
        let message = 'Could not save your username. Try again.';
        try {
          const data = await response.json();
          if (typeof data?.error === 'string') message = data.error;
        } catch { /* no message in the reply */ }
        throw new Error(message);
      }
      const account: AccountProfile = await response.json();
      setProfile(account);
      setLoadFailed(false);
      setDraftName(null);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your username. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function logoutAfterDelete() {
    setDeleteError('');
    try {
      await logout({ logoutParams: { returnTo: window.location.origin } });
    } catch {
      setDeleteError('Your data was deleted. Log out to finish.');
    }
  }

  async function deleteAccountData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || loadingProfile || saving || deleting || deleted) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_URL}/api/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Account deletion request failed');
      setDeleted(true);
      await logoutAfterDelete();
    } catch {
      setDeleteError('Could not confirm deletion. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0 text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => {
          setShowProfile(false);
          setIsOpen(!isOpen);
        }}
        className="flex w-64 max-w-full cursor-pointer items-center gap-3 rounded-lg bg-[#203e32] px-2.5 py-1.5 text-sm font-medium text-zinc-100 hover:bg-[#315c49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white">
          {Array.from(name)[0].toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{name}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isOpen ? 'size-4 shrink-0 rotate-180' : 'size-4 shrink-0'}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div id={menuId} hidden={!isOpen} className="absolute top-full left-0 z-50 mt-2 w-64 max-w-[calc(100vw-2.5rem)] rounded-xl border border-[#315c49] bg-[#203e32] text-sm text-zinc-100 shadow-xl">
        <p className="break-words border-b border-white/20 px-4 py-3 font-semibold">{name}</p>
        <div className="p-1">
          <button
            type="button"
            aria-expanded={showProfile}
            aria-controls={`${menuId}-profile`}
            onClick={() => setShowProfile(!showProfile)}
            className="logout-button"
          >
            Profile
          </button>
          <div id={`${menuId}-profile`} hidden={!showProfile} className="px-3 pb-3">
            <p className="break-words py-2 text-zinc-300">{user?.email || profile?.email || 'No email available'}</p>
            {userId && (
              <form className="grid gap-2" onSubmit={saveUsername}>
                <label htmlFor={`${menuId}-name`} className="font-medium">Username</label>
                <input
                  id={`${menuId}-name`}
                  aria-describedby={`${menuId}-name-hint`}
                  value={draftName ?? name}
                  onChange={event => {
                    // Usernames are lowercase with no spaces, so tidy them up while typing
                    setDraftName(event.target.value.toLowerCase().replace(/\s/g, ''));
                    setSaveError('');
                    setSaved(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={maxUsernameLength}
                  disabled={loadingProfile}
                  readOnly={saving}
                  required
                  className="min-h-11 min-w-0 rounded-md border border-white/30 bg-[#fffdf8] px-3 py-2 text-base text-[#203e32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                />
                <button
                  type="submit"
                  disabled={loadingProfile || saving}
                  className="min-h-11 cursor-pointer justify-self-end rounded-md bg-[#fffdf8] px-4 font-medium text-[#203e32] hover:bg-[#e8ede4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-default disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <p id={`${menuId}-name-hint`} className="text-sm text-zinc-300">
                  3–30 characters: lowercase letters, numbers, dots and underscores. Everyone in your calendars sees it.
                </p>
                {saveError && <p role="alert" className="text-red-200">{saveError}</p>}
                <p role="status" className="text-zinc-200 empty:hidden">
                  {loadingProfile ? 'Loading profile…' : loadFailed ? 'Could not load your saved profile.' : saved ? 'Username saved.' : ''}
                </p>
              </form>
            )}
            {userId && (
              <div className="mt-3 border-t border-white/20 pt-2">
                <button
                  type="button"
                  disabled={loadingProfile || saving || deleting || deleted}
                  className="min-h-11 cursor-pointer rounded-md text-left font-medium text-red-200 hover:text-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200 disabled:cursor-default disabled:opacity-60"
                  onClick={() => {
                    setDeleteError('');
                    deleteDialogRef.current?.showModal();
                  }}
                >
                  Delete account data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <dialog
        ref={deleteDialogRef}
        aria-labelledby={`${menuId}-delete-title`}
        aria-describedby={`${menuId}-delete-description`}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl border border-[#aab7aa] bg-[#fffdf8] p-5 text-left text-sm text-[#203e32] shadow-xl backdrop:bg-black/40"
        onCancel={event => { if (deleting || deleted) event.preventDefault(); }}
      >
        <form onSubmit={deleteAccountData}>
          <h2 id={`${menuId}-delete-title`} className="text-lg font-semibold">
            {deleted ? 'Account data deleted' : 'Delete account data?'}
          </h2>
          <p id={`${menuId}-delete-description`}>
            {deleted
              ? 'You’ll be signed out.'
              : 'This permanently deletes your profile, calendars you own and their events. Your sign-in account will still exist (Until this is updated).'}
          </p>
          {deleteError && <p role="alert" className="mt-3 text-red-800">{deleteError}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {deleted ? (
              <button
                type="button"
                disabled={deleting}
                className="min-h-11 rounded-md bg-[#203e32] px-4 font-medium text-white disabled:opacity-60"
                onClick={() => { void logoutAfterDelete(); }}
              >
                Log out
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  className="min-h-11 rounded-md border border-[#aab7aa] px-4 font-medium disabled:opacity-60"
                  onClick={() => deleteDialogRef.current?.close()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="min-h-11 rounded-md bg-red-800 px-4 font-medium text-white hover:bg-red-900 disabled:opacity-60"
                >
                  {deleting ? 'Deleting…' : 'Delete account data'}
                </button>
              </>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}