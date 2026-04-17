/** TrueLayer Payments API v3 — shared type definitions. */

export type PaymentStatus =
  | "authorization_required"
  | "authorizing"
  | "authorized"
  | "executed"
  | "settled"
  | "failed"
  | "attempt_failed"
  | "cancelled";

export type RefundStatus = "pending" | "authorized" | "executed" | "failed";

export type PaymentLinkStatus = "active" | "inactive";

export type ActionType =
  | "provider_selection"
  | "scheme_selection"
  | "redirect"
  | "form"
  | "consent"
  | "wait";

export interface AccountIdentifier {
  type: string;
  sort_code?: string;
  account_number?: string;
  iban?: string;
  bban?: string;
}

export interface Beneficiary {
  type: string;
  merchant_account_id?: string;
  account_holder_name?: string;
  account_identifier?: AccountIdentifier;
  reference?: string;
  payment_source_id?: string;
  user_id?: string;
}

export interface PaymentUser {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface ProviderFilter {
  provider_ids?: string[];
  countries?: string[];
  currencies?: string[];
  release_channel?: string;
  customer_segments?: string[];
}

export interface Remitter {
  name?: string;
  account_identifier?: AccountIdentifier;
}

export interface ProviderSelection {
  type: string;
  provider_id?: string;
  scheme_id?: string;
  remitter?: Remitter;
  filter?: ProviderFilter;
}

export interface PaymentMethod {
  type: string;
  provider_selection: ProviderSelection;
  beneficiary: Beneficiary;
}

export interface NextAction {
  type: ActionType;
  uri?: string;
  providers?: unknown[];
  schemes?: unknown[];
  inputs?: unknown[];
}

export interface AuthorizationFlow {
  actions?: { next?: NextAction };
}

export interface CreatedPayment {
  id: string;
  resource_token: string;
  user: PaymentUser;
  status: PaymentStatus;
  authorization_flow?: AuthorizationFlow;
}

export interface Payment {
  id: string;
  amount_in_minor: number;
  currency: string;
  payment_method: PaymentMethod;
  user: PaymentUser;
  status: PaymentStatus;
  created_at?: string;
  executed_at?: string;
  settled_at?: string;
  failure_stage?: string;
  failure_reason?: string;
  metadata?: Record<string, string>;
}

export interface Refund {
  id: string;
  amount_in_minor: number;
  currency: string;
  reference?: string;
  status: RefundStatus;
  created_at?: string;
  executed_at?: string;
  metadata?: Record<string, string>;
}

export interface PaymentLink {
  id: string;
  link: string;
  status: PaymentLinkStatus;
  created_at?: string;
  expires_at?: string;
  metadata?: Record<string, string>;
}

export interface Provider {
  id: string;
  display_name: string;
  logo_uri?: string;
  icon_uri?: string;
  bg_color?: string;
  country_code?: string;
  capabilities?: string[];
  schemes?: string[];
}

export interface CreatePaymentRequest {
  amount_in_minor: number;
  currency: string;
  payment_method: PaymentMethod;
  user: PaymentUser;
  metadata?: Record<string, string>;
}

export interface CreateRefundRequest {
  amount_in_minor?: number;
  reference?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentLinkRequest {
  payment_id: string;
  expires_at?: string;
  custom_metadata?: Record<string, string>;
}
