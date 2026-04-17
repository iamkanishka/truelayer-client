import type { AccountIdentifier } from "../payments/types.js";

export type PayoutStatus = "pending" | "authorized" | "executed" | "failed";

export interface ExternalAccountPayoutBeneficiary {
  type: "external_account";
  account_holder_name: string;
  account_identifier: AccountIdentifier;
  reference?: string;
}

export interface BusinessAccountPayoutBeneficiary {
  type: "business_account";
  reference?: string;
}

export interface PaymentSourcePayoutBeneficiary {
  type: "payment_source";
  payment_source_id: string;
  user_id: string;
  reference?: string;
}

export type PayoutBeneficiary =
  | ExternalAccountPayoutBeneficiary
  | BusinessAccountPayoutBeneficiary
  | PaymentSourcePayoutBeneficiary;

export interface CreatePayoutRequest {
  merchant_account_id: string;
  amount_in_minor: number;
  currency: string;
  beneficiary: PayoutBeneficiary;
  metadata?: Record<string, string>;
}

export interface Payout {
  id: string;
  merchant_account_id: string;
  amount_in_minor: number;
  currency: string;
  beneficiary: PayoutBeneficiary;
  status: PayoutStatus;
  created_at?: string;
  executed_at?: string;
  metadata?: Record<string, string>;
}
