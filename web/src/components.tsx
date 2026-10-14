import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAddress, type Address } from 'viem';
import type { Runtime } from './config';

export function Icon({
  name = 'pick',
  size = 20,
}: {
  name?:
    'pick' | 'grid' | 'stack' | 'chart' | 'gift' | 'arrow' | 'wallet' | 'close' | 'check' | 'copy';
  size?: number;
}) {
  const paths = {
    pick: 'm4 20 9-9M3 7l4-4 14 4-4 4L3 7Zm9 4 7 7-2 2-7-7',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    stack: 'm3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
    chart: 'M4 20V10m8 10V4m8 16v-7',
    gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    wallet: 'M3 6h16v14H3zM3 6V4h14v2m-2 6h6v4h-6z',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const active = document.activeElement as HTMLElement;
    dialog.showModal();
    return () => {
      dialog.close();
      active?.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function AddressLink({
  address,
  r,
  label,
}: {
  address: Address;
  r: Runtime;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="address-block">
      {label && <span className="muted">{label}</span>}
      <div className="address-line">
        <a
          className="address"
          href={`${r.deployment.network.explorer}/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          {getAddress(address)}
        </a>
        <button
          className="icon-button"
          aria-label={`Copy ${label || 'address'}`}
          onClick={() => {
            navigator.clipboard
              .writeText(getAddress(address))
              .then(() => setCopied(true))
              .catch(() => setError('Select the address to copy it.'));
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      {error && <small role="status">{error}</small>}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Notice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'error';
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}
export function MinerArt({ gold = false }: { gold?: boolean }) {
  const green = gold ? '#e2bc52' : '#6baf64',
    shade = gold ? '#ac8633' : '#4d874d';
  return (
    <svg
      className="miner-art"
      viewBox="0 0 160 150"
      role="img"
      aria-label={
        gold ? 'Gold Overclocked pixel miner artwork preview' : 'Green pixel miner artwork preview'
      }
      shapeRendering="crispEdges"
    >
      <path fill="#1d2a20" d="M0 0h160v150H0z" />
      <path
        fill="#263b29"
        d="M0 120h160v30H0zM5 20h6v6H5zm132 10h4v4h-4zM19 56h4v4h-4zm128 26h5v5h-5z"
      />
      <path fill="#253c30" d="M35 118h90v32H35z" />
      <path fill="#3b5c44" d="M42 113h76v15H42z" />
      <path fill={shade} d="M41 58h76v54H41zM47 112h64v6H47z" />
      <path fill={green} d="M41 58h76v44H41zM47 52h64v6H47z" />
      <path fill="#eef2d8" d="M46 64h28v18H46zm40 0h28v18H86z" />
      <path
        fill="#17251b"
        d="M61 66h8v16h-8zm40 0h8v16h-8zM48 62h27v5H48zm38 0h28v5H86zM49 96h57v6H49zM43 90h6v6h-6z"
      />
      <path
        fill={gold ? '#ecd571' : '#b8bd65'}
        d="M38 29h81v29H38zM45 23h67v6H45zM31 53h95v7H31z"
      />
      <path fill="#778049" d="M51 29h9v24h-9zm48 0h9v24h-9z" />
      <path fill="#283c31" d="M69 34h20v14H69z" />
      <path fill="#e9f9ba" d="M74 37h10v8H74z" />
      <path fill="#aa8655" d="M132 81h6v60h-6z" />
      <path fill="#9eafa0" d="M116 76h35v7h-35zM122 70h23v6h-23z" />
      <path fill="#b8dd8b" d="M50 125h12v25H50zm48 0h12v25H98z" />
      <path fill="#233628" d="M68 131h23v7H68z" />
    </svg>
  );
}
