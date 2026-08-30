"use client";

import type { SourcesResponse, SourceRow } from "../../lib/contracts.ts";
import { Modal } from "../ui/modal.tsx";
import { Pill } from "../ui/pill.tsx";

type ObModalProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sources: SourcesResponse | null;
};

/** The "Gerenciar bancos" modal. Read-only by design: adding a connection is
 *  environment configuration (ADR §2), and the modal says so in plain words. */
export function ObModal({ open, onClose, sources }: ObModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Conectar bancos" sub="Via Open Banking — acesso somente leitura, revogável a qualquer momento.">
      {sources === null ? <p className="modal-sub">Carregando…</p> : <SourceList sources={sources} />}
      <p className="meta" style={{ marginTop: "14px", lineHeight: "1.6" }}>
        Consentimento regulado pela LGPD e pelas normas do Banco Central. O Fluxo nunca move valores — apenas lê e
        classifica suas transações. Novas conexões são configuradas no ambiente do servidor (PLUGGY_ITEM_IDS); o
        Fluxo não pode abrir o fluxo de conexão do banco por conta própria.
      </p>
    </Modal>
  );
}

function SourceList({ sources }: { readonly sources: SourcesResponse }) {
  if (!sources.ok) {
    return (
      <div>
        {sources.problems.map((problem) => (
          <p key={problem} className="modal-sub" style={{ marginTop: "8px" }}>
            {problem}
          </p>
        ))}
      </div>
    );
  }

  if (sources.sources.length === 0) {
    return <p className="modal-sub">Nenhuma conexão configurada ainda.</p>;
  }

  return (
    <div style={{ marginTop: "10px" }}>
      {sources.sources.map((source) => (
        <SourceRow key={source.connectionId} source={source} />
      ))}
    </div>
  );
}

function SourceRow({ source }: { readonly source: SourceRow }) {
  const consentLabel: Readonly<Record<SourceRow["consent"], { readonly text: string; readonly tone: "pos" | "neg" | "flat" | "accent" }>> = {
    active: { text: "ativo", tone: "pos" },
    revoked: { text: "revogado", tone: "neg" },
    expired: { text: "expirado", tone: "neg" },
    unknown: { text: "desconhecido", tone: "flat" },
  };
  const consent = consentLabel[source.consent];

  return (
    <div className="bank-row">
      <span className="bank-mark" style={{ background: "var(--accent)" }}>{source.institution.slice(0, 2).toUpperCase()}</span>
      <div className="bank-name">
        <b>{source.institution}</b>
        <span>{source.failure !== null ? source.failure.message : `Status ${source.status}`}</span>
        {source.lastUpdatedAt !== null ? <span>Última sincronização: {new Date(source.lastUpdatedAt).toLocaleString("pt-BR")}</span> : null}
      </div>
      <Pill tone={consent.tone}>{consent.text}</Pill>
    </div>
  );
}
