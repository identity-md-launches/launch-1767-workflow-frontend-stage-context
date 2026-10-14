import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Runtime } from './config';
import { tokenMetadata, type GlobalState, type TokenRow } from './chain';
import { Icon, Modal, Notice } from './components';
import { errorText } from './utils';

export function TokenCard({
  r,
  id,
  minted,
  selected,
  onSelect,
}: {
  r: Runtime;
  id: number;
  minted: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const metadata = useQuery({
    queryKey: ['metadata', r.nft, id],
    queryFn: () => tokenMetadata(r, id),
    enabled: minted,
    staleTime: 60000,
    retry: 1,
  });
  const data = metadata.data;
  const over = data?.attributes.some((a) => a.trait_type === 'Tier' && a.value === 'Overclocked');
  return (
    <>
      <article className={`token-card ${over ? 'overclocked' : ''}`}>
        <button
          className="token-art"
          disabled={!minted}
          onClick={() => setOpen(true)}
          aria-label={`View Veteran #${id} traits`}
        >
          {data ? (
            <img
              src={data.image}
              width="240"
              height="240"
              alt={`${data.name}, ${over ? 'Overclocked' : 'Veteran'} pixel miner`}
            />
          ) : (
            <div className="unmined-art">
              <Icon size={36} />
              <span>
                {!minted ? 'Not yet mined' : metadata.isError ? 'Art unavailable' : 'Loading art…'}
              </span>
            </div>
          )}
        </button>
        <div className="token-title">
          <strong>Veteran #{id}</strong>
          {onSelect && (
            <input
              type="checkbox"
              aria-label={`Select Veteran #${id}`}
              checked={selected}
              onChange={onSelect}
            />
          )}
        </div>
        <span className={over ? 'gold' : 'muted'}>
          {!minted ? 'Unmined' : over ? 'Overclocked' : data ? 'Veteran' : 'Awaiting metadata'}
        </span>
      </article>
      {open && (
        <Modal title={`Veteran #${id}`} onClose={() => setOpen(false)}>
          {data ? (
            <>
              <img className="detail-art" src={data.image} alt={data.name} />
              <dl className="trait-list">
                {data.attributes.map((a) => (
                  <div key={a.trait_type}>
                    <dt>{a.trait_type}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="small muted">
                Rarity changes the art only. Every Veteran has the same staking utility.
              </p>
            </>
          ) : (
            <Notice tone="error">
              {metadata.error ? errorText(metadata.error) : 'Loading metadata…'}
              <button onClick={() => void metadata.refetch()}>Retry metadata</button>
            </Notice>
          )}
          <a
            className="text-button"
            href={`${r.deployment.network.explorer}/token/${r.nft}?a=${id}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer ↗
          </a>
        </Modal>
      )}
    </>
  );
}
export interface Registry {
  rows?: TokenRow[];
  loading: boolean;
  error: string;
  progress: number;
  load: () => void;
  cancel: () => void;
  clear: () => void;
}
export function RegistryControl({ registry, total }: { registry: Registry; total: number }) {
  return (
    <div className="registry-control">
      <button className="button" disabled={registry.loading} onClick={registry.load}>
        {registry.loading
          ? `Reading ${registry.progress} / ${total} minted NFTs…`
          : registry.rows
            ? 'Refresh collection index'
            : 'Load collection index'}
      </button>
      {registry.loading && (
        <button className="button" onClick={registry.cancel}>
          Stop scan
        </button>
      )}
      {registry.error && (
        <p className="error" role="status">
          {registry.error}
        </p>
      )}
    </div>
  );
}
export function Gallery({
  r,
  state,
  registry,
}: {
  r: Runtime;
  state?: GlobalState;
  registry: Registry;
}) {
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('id');
  useEffect(() => setPage(0), [filter, query, sort]);
  const max = Number(state?.maxSupply ?? 3333n),
    minted = Number(state?.minted ?? 0n);
  const rarity = useQuery({
    queryKey: ['rarity', state?.renderer, registry.rows?.map((t) => t.seed).join('')],
    queryFn: async ({ signal }) => {
      const traits = new Map<number, { score: bigint; overclocked: boolean }>();
      if (!registry.rows || !state) return traits;
      // Use the live renderer, so replacing a renderer cannot silently leave a stale local rarity algorithm.
      for (let i = 0; i < registry.rows.length; i += 16) {
        if (signal.aborted) throw new Error('Trait scan stopped.');
        await Promise.all(
          registry.rows.slice(i, i + 16).map(async (t) => {
            const [score, visual] = await Promise.all([
              r.publicClient.readContract({
                address: state.renderer,
                abi: r.abis.VeteransRenderer,
                functionName: 'rarityScore',
                args: [t.seed],
              }),
              r.publicClient.readContract({
                address: state.renderer,
                abi: r.abis.VeteransRenderer,
                functionName: 'traitsOf',
                args: [t.seed],
              }),
            ]);
            traits.set(t.id, {
              score: score as bigint,
              overclocked: (visual as { overclocked: boolean }).overclocked,
            });
          }),
        );
      }
      return traits;
    },
    enabled: (sort === 'rarity' || filter === 'overclocked') && !!registry.rows && !!state,
    staleTime: 60000,
    retry: 0,
  });
  let ids = Array.from({ length: max }, (_, i) => i + 1);
  if (filter === 'minted') ids = ids.filter((id) => id <= minted);
  if (filter === 'unmined') ids = ids.filter((id) => id > minted);
  if (filter === 'overclocked')
    ids =
      registry.rows?.filter((row) => rarity.data?.get(row.id)?.overclocked).map((row) => row.id) ||
      [];
  if (query.trim()) ids = ids.filter((id) => id.toString() === query.trim().replace('#', ''));
  if (sort === 'rarity' && rarity.data)
    ids = ids
      .filter((id) => id <= minted)
      .sort(
        (a, b) =>
          Number((rarity.data!.get(b)?.score || 0n) - (rarity.data!.get(a)?.score || 0n)) || a - b,
      );
  const pages = Math.max(1, Math.ceil(ids.length / 24));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>The Veterans.</h1>
          <p>3,333 places in the mine. Traits reveal with each winning proof.</p>
        </div>
        <span className="network-tag">
          {state ? `${minted.toLocaleString()} mined` : 'Reading supply…'}
        </span>
      </div>
      <div className="filter-bar">
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Veterans</option>
            <option value="minted">Minted</option>
            <option value="overclocked">Overclocked</option>
            <option value="unmined">Unmined</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="id">Token number</option>
            <option value="rarity">Rarity score</option>
          </select>
        </label>
        <label>
          Find token
          <input
            inputMode="numeric"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Token number"
          />
        </label>
      </div>
      {(filter === 'overclocked' || sort === 'rarity') && (
        <>
          <p className="muted small">
            Load the minted collection to filter across every token. Rarity is visual only.
          </p>
          <RegistryControl registry={registry} total={minted} />
          {rarity.isFetching && <p role="status">Reading rarity scores from the renderer…</p>}
          {rarity.error && (
            <Notice tone="error">
              {errorText(rarity.error)}
              <button onClick={() => void rarity.refetch()}>Retry rarity scores</button>
            </Notice>
          )}
        </>
      )}
      {!state ? (
        <Notice>
          Reading collection supply. Token availability will appear when RPC reads complete.
        </Notice>
      ) : ids.length ? (
        <div className="gallery-grid">
          {ids
            .slice(Math.min(page, pages - 1) * 24, Math.min(page, pages - 1) * 24 + 24)
            .map((id) => (
              <TokenCard key={id} r={r} id={id} minted={id <= minted} />
            ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="grid" size={36} />
          <h2>
            {filter === 'overclocked' && !registry.rows
              ? 'Load the collection first'
              : 'No matching Veterans'}
          </h2>
          <p>Change the filter or search another token number.</p>
          <button
            className="button"
            onClick={() => {
              setFilter('all');
              setQuery('');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="pagination">
        <button
          className="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Previous
        </button>
        <span>
          Page {Math.min(page, pages - 1) + 1} of {pages}
        </span>
        <button
          className="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= pages - 1}
        >
          Next
        </button>
      </div>
      <p className="small muted">
        Unmined tokens have no traits or image yet. Their eventual rarity does not affect staking
        rewards.
      </p>
    </>
  );
}
