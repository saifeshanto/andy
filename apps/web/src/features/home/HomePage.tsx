import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { MoneyRM } from '@/components/ui/MoneyRM';

/** Phase 0 placeholder home. Real content arrives with the marketplace module (M2). */
export function HomePage() {
  return (
    <main>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-20 sm:px-6 md:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-400">Andy Auto Club</p>
          <h1 className="font-display text-5xl font-bold uppercase leading-none sm:text-7xl">
            Drive more.
            <br />
            Pay less.
          </h1>
          <p className="max-w-xl text-lg text-ink-300">
            Malaysia's automotive marketplace and membership club: workshops, detailing, parts and member-only vouchers in
            one place.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-ink-300">
            Annual membership <MoneyRM sen={39900} className="font-semibold text-white" /> / year
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/marketplace" className="inline-flex min-h-11 items-center rounded-full bg-accent-500 px-6 font-semibold hover:bg-accent-600">Browse the marketplace</Link>
            <Link to="/merchant/apply" className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-6 font-semibold hover:bg-white/20">List your business</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6">
        {[
          ['Marketplace', 'Find trusted automotive merchants near you.'],
          ['Member vouchers', 'Redeem at the counter with a QR code.'],
          ['Merchant portal', 'List services and scan vouchers from any phone.'],
        ].map(([title, body]) => (
          <Card key={title}>
            <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
            <p className="mt-2 text-ink-500">{body}</p>
          </Card>
        ))}
      </section>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-ink-500 sm:px-6">
        <Link to="/status" className="underline">
          System status
        </Link>
      </footer>
    </main>
  );
}
