import type { Bank, BankFailure, CategoryWriter, ClosingDayStore, TransactionNoteStore } from "@cata-centavo/core";
import type { TransactionReader } from "@cata-centavo/core";

/** The configured bank source, or the configuration problems that prevent it. */
export type Source =
  | {
      readonly ok: true;
      readonly connections: readonly string[];
      readonly bank: Bank;
      readonly toFailure: (error: unknown) => BankFailure;
      readonly reader: TransactionReader;
      readonly writer: CategoryWriter;
      readonly noteWriter?: TransactionNoteStore;
      readonly closingDays?: ClosingDayStore;
    }

  | {
      readonly ok: false;
      readonly problems: readonly string[];
      readonly databaseProblems?: readonly string[];
    };
