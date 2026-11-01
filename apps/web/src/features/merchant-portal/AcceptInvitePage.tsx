import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['merchant-invite', token],
    queryFn: () => api<{ data: { merchant: string; role: string; email: string } }>(`/merchant-invites/preview?token=${encodeURIComponent(token)}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api<{ data: { merchantId: string } }>('/merchant-invites/accept', { method: 'POST', json: { token } }).then((r) => r.data),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: ['me', 'merchants'] });
      navigate(`/merchant/${d.merchantId}`);
    },
  });
  const p = preview.data;
  const wrongAccount = p && user && user.email.toLowerCase() !== p.email;

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Card>
        {!token && <Alert tone="danger">This link is incomplete. Open the link from your email again.</Alert>}
        {preview.isLoading && <Spinner />}
        {preview.isError && <Alert tone="danger">{preview.error instanceof ApiError ? preview.error.message : 'This invitation could not be found.'}</Alert>}
        {p && (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-500">Invitation</p>
            <h1 className="mt-1 font-display text-3xl font-bold uppercase">Join {p.merchant}</h1>
            <p className="mt-2 text-ink-500">You have been invited as a {p.role.toLowerCase()}.</p>
            {wrongAccount ? (
              <>
                <div className="mt-4"><Alert tone="warning">This invitation is for {p.email}, but you are signed in as {user.email}.</Alert></div>
                <Button className="mt-4 w-full" variant="secondary" onClick={async () => { await logout(); navigate(`/login?next=${encodeURIComponent(`/merchant/invite?token=${token}`)}`); }}>
                  Sign in as {p.email}
                </Button>
              </>
            ) : (
              <>
                {accept.isError && <div className="mt-4"><Alert tone="danger">{accept.error instanceof ApiError ? accept.error.message : 'Could not accept'}</Alert></div>}
                <Button className="mt-6 w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? 'Joining…' : 'Accept and open the portal'}</Button>
              </>
            )}
          </>
        )}
        <Link to="/account" className="mt-6 block text-center text-sm text-ink-500 underline">Not now</Link>
      </Card>
    </main>
  );
}
