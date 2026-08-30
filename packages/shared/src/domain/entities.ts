export type Instant = number;

export type CountryCode = "TR" | "TRNC";
export type UserRole = "agent" | "broker";
export type CurrencyCode = "TRY" | "GBP" | "USD" | "EUR";
export type ContactSource =
  | "in_person"
  | "referral"
  | "listing"
  | "social"
  | "door"
  | "area"
  | "address_book"
  | "other";
export type ContactRole =
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "investor"
  | "peer"
  | "information_source"
  | "referral_source"
  | "unknown";
export type InteractionChannel = "in_person" | "phone" | "whatsapp" | "sms" | "email" | "other";
export type InteractionObjective =
  | "get_acquainted"
  | "provide_value"
  | "permission"
  | "appointment"
  | "request_referral"
  | "request_listing"
  | "follow_up"
  | "presentation"
  | "offer";
export type AskOutcome = "positive" | "unclear" | "negative" | "not_asked" | "not_applicable";
export type RelationshipStage = "new" | "getting_to_know" | "engaged" | "active" | "referral_source";
export type NextActionType =
  | "call"
  | "message"
  | "appointment"
  | "valuation"
  | "offer"
  | "complete_permission"
  | "make_ask"
  | "other";
export type OpportunityType =
  | "seller_listing"
  | "landlord_listing"
  | "buyer_requirement"
  | "tenant_requirement";
export type OpportunityStage =
  | "new_lead"
  | "first_contact"
  | "appointment"
  | "valuation"
  | "mandate_offer"
  | "won"
  | "lost";
export type PropertyType = "apartment" | "villa" | "detached_house" | "land" | "commercial";
export type PropertyFeature =
  | "ground_floor"
  | "no_elevator"
  | "furnished"
  | "sea_view"
  | "parking"
  | "garden"
  | "pool"
  | "gated_community"
  | "middle_floor"
  | "top_floor"
  | "new_building";
export type PropertyTransactionType = "buy" | "sell" | "rent" | "let" | "invest";

export interface PropertyPreferences {
  transactionType: PropertyTransactionType | null;
  propertyTypes: PropertyType[];
  preferredLocations: string[];
  budgetRange: { min: number | null; max: number | null; currency: CurrencyCode } | null;
  bedroomCountMin: number | null;
  livingRoomCountMin: number | null;
  roomCountMin: number | null;
  areaMinM2: number | null;
  areaMaxM2: number | null;
  mustHaves: string[];
  dealBreakers: string[];
  timeline: string | null;
}

export interface ContactPropertySituation {
  propertyContext: "search_preference" | "subject_property";
  summary: string;
  propertyPreferences: PropertyPreferences;
}

export interface ContactMemory {
  keyThingsToRemember: string[];
  /** The collapsed primary situation, kept for callers that expect a single set. */
  propertyPreferences: PropertyPreferences;
  /** Every distinct situation, so a seller who is also buying keeps both sides. */
  propertySituations: ContactPropertySituation[];
  updatedAt: Instant | null;
}
export type AuthorizationType = "exclusive" | "open" | "verbal" | "unknown";
export type ListingStatus = "preparing" | "active" | "reserved" | "sold" | "rented" | "removed";
export type LegalBasis = "legitimate_interest" | "contract" | "legal_obligation" | "explicit_consent";
export type MarketingChannel = "phone" | "whatsapp" | "sms" | "email";
export type IysStatus = "unknown" | "approved" | "rejected" | "exempt";

export interface TenantOwned {
  officeId: string;
  ownerUid: string;
}

export interface Audited {
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Office {
  name: string;
  country: CountryCode;
  retentionPolicyVersion: string;
  createdAt: Instant;
}

export interface User extends Audited {
  officeId: string;
  role: UserRole;
  displayName: string;
  phone: string | null;
  defaultRegions: string[];
  monthlyPortfolioTarget: number | null;
  weeklyCapacity: number | null;
}

export interface Contact extends TenantOwned, Audited {
  phone: string | null;
  phoneHash: string | null;
  fullName: string | null;
  label: string | null;
  metAtPlace: string | null;
  metAt: Instant;
  source: ContactSource;
  roles: ContactRole[];
  relationship: {
    stage: RelationshipStage;
    meaningfulTouchCount: number;
    reciprocalTouchCount: number;
    lastTouchAt: Instant | null;
    nextActionAt: Instant | null;
    nextActionType: NextActionType | null;
    lastObjective: InteractionObjective | null;
    lastAskOutcome: AskOutcome | null;
    referralCount: number;
  };
  memory: ContactMemory;
  privacy: {
    purposes: Record<string, { legalBasis: LegalBasis; startedAt: Instant }>;
    noticeStatus: "pending" | "completed";
    noticeAt: Instant | null;
    noticeMethod: "verbal" | "written" | "electronic" | null;
    noticeVersion: string | null;
    marketingConsent: "unknown" | "granted" | "withdrawn";
    marketingConsentAt: Instant | null;
    marketingWithdrawnAt: Instant | null;
    marketingChannels: Array<"phone" | "whatsapp" | "sms" | "email">;
    iysStatus: IysStatus;
    iysCheckedAt: Instant | null;
    profilingObjection: boolean;
    deletionRequestedAt: Instant | null;
  };
  deletedAt: Instant | null;
}

export interface Interaction extends TenantOwned {
  contactId: string;
  channel: InteractionChannel;
  occurredAt: Instant;
  objective: InteractionObjective;
  direction: "outbound" | "inbound" | "mutual";
  outcome: string | null;
  askOutcome: AskOutcome;
  nextActionAt: Instant | null;
  nextActionType: NextActionType | null;
  noteSummary: string | null;
  voiceNoteId: string | null;
  createdAt: Instant;
}


export type ReferralStatus = "received" | "first_contact_pending" | "qualified" | "converted" | "lost";
export interface Referral extends TenantOwned, Audited {
  sourceContactId: string;
  referredContactId: string | null;
  referredLabel: string | null;
  opportunityId: string | null;
  status: ReferralStatus;
  firstNoticeCompletedAt: Instant | null;
  deletedAt: Instant | null;
}

export interface Opportunity extends TenantOwned, Audited {
  type: OpportunityType;
  subjectContactId: string;
  sourceContactId: string | null;
  referralId: string | null;
  propertyId: string | null;
  stage: OpportunityStage;
  qualifiedAt: Instant | null;
  stageEnteredAt: Instant;
  nextActionAt: Instant | null;
  nextActionType: NextActionType | null;
  lostReason: string | null;
  estimatedValue: { amount: number; currency: CurrencyCode } | null;
  closedAt: Instant | null;
  deletedAt: Instant | null;
}

export interface StageEvent extends TenantOwned {
  entityType: "contact" | "referral" | "opportunity" | "listing" | "deal";
  entityId: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  commandId: string;
  occurredAt: Instant;
  createdAt: Instant;
}

export interface Property extends TenantOwned, Audited {
  ownerContactId: string | null;
  address: string;
  regionSlug: string;
  geo: { lat: number; lng: number } | null;
  geohash: string | null;
  type: PropertyType;
  roomCount: number | null;
  areaM2: number | null;
  features: PropertyFeature[];
  deletedAt: Instant | null;
}

export interface Listing extends TenantOwned, Audited {
  propertyId: string;
  opportunityId: string;
  authorizationType: AuthorizationType;
  propertySummary: {
    address: string;
    regionSlug: string;
    type: PropertyType;
    roomCount: number | null;
    areaM2: number | null;
    features: PropertyFeature[];
  };
  askingPrice: number;
  currency: CurrencyCode;
  status: ListingStatus;
  acquiredAt: Instant;
  expiresAt: Instant | null;
  deletedAt: Instant | null;
}

export type PresentationStatus = "draft" | "user_approved" | "sent" | "delivered" | "read" | "replied" | "failed";
export interface Presentation extends TenantOwned, Audited {
  listingId: string;
  contactId: string;
  message: string;
  channel: MarketingChannel;
  status: PresentationStatus;
  statusSource: "user_confirmation" | "whatsapp_business_webhook" | null;
  userConfirmedSentAt: Instant | null;
  externalMessageId: string | null;
  sentAt: Instant | null;
  deliveredAt: Instant | null;
  readAt: Instant | null;
  repliedAt: Instant | null;
  deletedAt: Instant | null;
}

export type DealStage = "presentation" | "viewing" | "offer" | "contract" | "closed" | "lost";
export interface Deal extends TenantOwned, Audited {
  listingId: string;
  buyerContactId: string | null;
  stage: DealStage;
  offerAmount: number | null;
  actualAmount: number | null;
  commissionAmount: number | null;
  currency: CurrencyCode | null;
  lostReason: string | null;
  closedAt: Instant | null;
  deletedAt: Instant | null;
}

export interface DailyTask extends TenantOwned, Audited {
  type:
    | "meet_new_contact"
    | "meaningful_interaction"
    | "provide_value"
    | "complete_permission"
    | "make_ask"
    | "advance_lead"
    | "advance_listing"
    | "follow_up_offer";
  relatedEntityType: "contact" | "referral" | "opportunity" | "listing" | "deal" | null;
  relatedEntityId: string | null;
  reason: string;
  evidence: {
    ruleId: string;
    ruleVersion: string;
    periodStart: Instant | null;
    periodEnd: Instant | null;
    metricId: string | null;
  };
  dueAt: Instant;
  estimatedMinutes: number | null;
  status: "pending" | "completed" | "skipped";
  completedAt: Instant | null;
  skippedReason: string | null;
}
