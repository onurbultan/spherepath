"use client";
import { OpportunityAction } from "../components/OpportunityAction";
import { RequirementMatches } from "../components/RequirementMatches";
import { RequirementMatchIndicator } from "../components/RequirementMatchIndicator";
import { portfolioMatchesQueryOptions } from "@/features/matching/resources/portfolio";


import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys, opportunityListSummary, opportunityJourneyFilters, opportunityJourneyLabels, opportunityOutcomeLabels, type OpportunityOutcomeFilter,
  contactMemoryLine,
  emptyVoicePropertyPreferences,
  opportunityCriteriaCopy,
  portfolioAuthorizationLabels,
  portfolioAuthorizationTypes,
  type OwnerOpportunityDetails,
  currencyCodes,
  isOwnerOpportunity,
  isOpenRequirement,
  summarizeOpportunityMatches,
  nextActionTypeLabels,
  nextActionTypes,
  nextOpportunityStages,
  opportunitySituation,
  opportunityCriteriaUpdateSchema,
  opportunityTransactionType,
  opportunityDraftSchema,
  opportunityStageCorrectionSchema,
  opportunityStageLabel, neutralOpportunityStageLabel,
  opportunityStages,
  opportunityTransitionSchema,
  opportunityTypeLabels,
  opportunityTypes,
  parseMoneyInput,
  propertyTypeLabels,
  propertyTypes,
  suggestOpportunityTypeForRoles,
  type CurrencyCode,
  type NextActionType,
  type OpportunityStage,
  type OpportunityType,
  type PropertyType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts, type ContactRecord } from "@/features/contacts/resources/contacts";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import {
  correctOpportunity,
  getOpportunityDetail,
  listOpportunities,
  moveOpportunity,
  saveOpportunity,
  updateOpportunityCriteria,
  type OpportunityRecord,
} from "../resources/opportunities";
import { handleFormKeyDown, SpField, SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";
import { MoneyField } from "@/shared/ui/MaskedFields";
import {
  opportunitiesForJourney,
  type OpportunityJourneyFilter,
} from "../viewModels/opportunity-list-scope";
import {
  groupWorkByUrgency,
  workPathProgress,
  workPathStages,
  workUrgencyLabels,
} from "../viewModels/work-queue";
import { ClosingSection } from "@/features/closing/views/ClosingSection";
import { listListings } from "@/features/listings/resources/listings";

function localDateTime(days = 1): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeFrom(timestamp: number | null): string {
  if (timestamp === null) return localDateTime();
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Fırsat işlemi tamamlanamadı.";
}

/** The row already names the action; this says only when it is due. */
function dueChip(value: number | null, now: number): string {
  if (value === null) return "Tarih belirlenmedi";
  const due = new Date(value);
  const today = new Date(now);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const time = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due);
  if (value < now) {
    const days = Math.floor((now - value) / 86_400_000);
    return days >= 1 ? `${days} gün gecikti` : `bugün ${time} · gecikti`;
  }
  if (due.toDateString() === today.toDateString()) return `bugün ${time}`;
  if (due.toDateString() === tomorrow.toDateString()) return `yarın ${time}`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(due);
}

const dateTime = (value: number) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const activeStages: OpportunityStage[] = [
  "new_lead",
  "first_contact",
  "appointment",
  "valuation",
  "mandate_offer",
];
const stageTone: Partial<Record<OpportunityStage, string>> = {
  new_lead: "cool",
  first_contact: "deed",
  appointment: "deed",
  valuation: "warm",
  mandate_offer: "good",
};

interface CriteriaForm {
  locationRequired: boolean;
  authorizationType: OwnerOpportunityDetails["authorizationType"];
  motivation: string;
  locations: string;
  propertyTypes: PropertyType[];
  budgetMin: string;
  budgetMax: string;
  currency: CurrencyCode;
  bedrooms: string;
  livingRooms: string;
  areaMin: string;
  mustHaves: string;
  timeline: string;
}

function preferencesFor(opportunity: OpportunityRecord) {
  return opportunity.criteria ?? opportunitySituation(opportunity.subjectContactMemory, opportunity.type)?.propertyPreferences
    ?? (isOwnerOpportunity(opportunity.type) ? emptyVoicePropertyPreferences : opportunity.subjectContactMemory.propertyPreferences);
}

function withCurrentContactMemory(opportunity: OpportunityRecord, contacts: readonly ContactRecord[]): OpportunityRecord {
  const contact = contacts.find((item) => item.id === opportunity.subjectContactId);
  return contact ? { ...opportunity, subjectContactName: contact.fullName ?? opportunity.subjectContactName, subjectContactMemory: contact.memory } : opportunity;
}

function optionalNumber(value: string): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : null;
}

function budgetLabel(
  preferences: OpportunityRecord["subjectContactMemory"]["propertyPreferences"],
): string | null {
  const budget = preferences.budgetRange;
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: budget.currency,
    maximumFractionDigits: 0,
  });
  if (budget.min !== null && budget.min === budget.max) return formatter.format(budget.min);
  if (budget.min !== null && budget.max !== null)
    return `${formatter.format(budget.min)} – ${formatter.format(budget.max)}`;
  if (budget.min !== null) return `${formatter.format(budget.min)} ve üzeri`;
  return budget.max !== null ? `${formatter.format(budget.max)} ve altı` : null;
}

function opportunityHighlights(opportunity: OpportunityRecord): string[] {
  const memory = opportunity.subjectContactMemory;
  // A contact selling one property while buying another keeps both situations;
  // showing the wrong one made two opportunities look identical on screen.
  const preferences = preferencesFor(opportunity);
  const highlights = [
    preferences.propertyTypes.length
      ? preferences.propertyTypes
          .map((item) => propertyTypeLabels[item])
          .join(", ")
      : null,
    preferences.preferredLocations.length
      ? preferences.preferredLocations.join(", ")
      : null,
    budgetLabel(preferences),
    preferences.bedroomCountMin !== null
      ? `${preferences.bedroomCountMin}+${preferences.livingRoomCountMin ?? 0} oda`
      : null,
    preferences.areaMinM2 !== null ? `${isOwnerOpportunity(opportunity.type) ? "Mülk alanı:" : "En az"} ${preferences.areaMinM2} m²` : null,
    preferences.mustHaves[0]
      ? `Olmazsa olmaz: ${preferences.mustHaves[0]}`
      : null,
    preferences.timeline,
  ].filter((item): item is string => Boolean(item));
  return highlights.length
    ? highlights.slice(0, 6)
    : isOwnerOpportunity(opportunity.type) ? [] : memory.keyThingsToRemember.slice(0, 2);
}

export function OpportunitiesView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [referenceTime] = useState(Date.now);
  const { session } = useSession();
  const queryClient = useQueryClient();
  const opportunitiesQuery = useQuery({
    queryKey: apiQueryKeys.opportunities,
    queryFn: listOpportunities,
  });
  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
  });
  // Marketing a mandate and closing on it are the second half of the same
  // pipeline, so they live on the same screen as the first half.
  const listingsQuery = useQuery({
    queryKey: apiQueryKeys.listings,
    queryFn: listListings,
  });
  const contacts = contactsQuery.data ?? [];
  const opportunities = (opportunitiesQuery.data ?? []).map((opportunity) => withCurrentContactMemory(opportunity, contacts));
  const [demandLocation, setDemandLocation] = useState("");
  const [demandPropertyType, setDemandPropertyType] = useState<PropertyType | "">("");
  const [demandBudget, setDemandBudget] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createRequested = searchParams.get("create") === "1";
  const requestedContactId = searchParams.get("contactId");
  const activeCreateOpen = createOpen || createRequested;
  const [moving, setMoving] = useState<OpportunityRecord | null>(null);
  const [correcting, setCorrecting] = useState<OpportunityRecord | null>(null);
  const [selected, setSelected] = useState<OpportunityRecord | null>(null);
  const [criteriaEditing, setCriteriaEditing] = useState<OpportunityRecord | null>(null);
  const [criteriaAddressError, setCriteriaAddressError] = useState<string | null>(null);
  const [criteriaForm, setCriteriaForm] = useState<CriteriaForm>({ locationRequired: false, authorizationType: "unknown", motivation: "", locations: "", propertyTypes: [], budgetMin: "", budgetMax: "", currency: "TRY", bedrooms: "", livingRooms: "", areaMin: "", mustHaves: "", timeline: "" });
  const [dismissedDeepLink, setDismissedDeepLink] = useState<string | null>(
    null,
  );
  const requestedOpportunityId = searchParams.get("opportunityId");
  const linkedOpportunity =
    requestedOpportunityId && dismissedDeepLink !== requestedOpportunityId
      ? (opportunities.find(
          (opportunity) => opportunity.id === requestedOpportunityId,
        ) ?? null)
      : null;
  const activeSelected = selected ? opportunities.find((item) => item.id === selected.id) ?? selected : linkedOpportunity;
  const detailQuery = useQuery({
    queryKey: apiQueryKeys.opportunityDetail(activeSelected?.id ?? "none"),
    queryFn: () => getOpportunityDetail(activeSelected!.id),
    enabled: Boolean(activeSelected),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(
    searchParams.get("contactId") ?? "",
  );
  const [type, setType] = useState<OpportunityType>("seller_listing");
  const [typeWasChosen, setTypeWasChosen] = useState(false);
  const [actionType, setActionType] = useState<NextActionType>("call");
  const [actionAt, setActionAt] = useState(localDateTime());
  const [targetStage, setTargetStage] =
    useState<OpportunityStage>("first_contact");
  const [reason, setReason] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostKind, setLostKind] = useState<"lost" | "duplicate">("lost");
  const [correctionReason, setCorrectionReason] = useState("");
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "all">("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [chosenJourney, setJourneyFilter] =
    useState<OpportunityJourneyFilter | null>(null);
  const journeyFilter = chosenJourney ?? "all";
  const [actionFilter, setActionFilter] = useState<
    "all" | "missing" | "overdue"
  >("all");
  const [outcomeFilter, setOutcomeFilter] =
    useState<OpportunityOutcomeFilter>("open");

  useEffect(() => {
    if (!linkedOpportunity) return;
    // A deep link is external navigation state; the list must not hide the
    // record it points at, so both the journey and the stage open up.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJourneyFilter("all");
    setStageFilter("all");
    setOutcomeFilter(
      linkedOpportunity.stage === "won" || linkedOpportunity.stage === "lost"
        ? linkedOpportunity.stage
        : "open",
    );
  }, [linkedOpportunity]);

  function closeCreate() {
    setCreateOpen(false);
    if (createRequested || requestedContactId)
      router.replace("/opportunities", { scroll: false });
  }

  const selectedContactId = contactId;
  const chooseContact = (nextContactId: string) => {
    setContactId(nextContactId);
    const suggestion = suggestOpportunityTypeForRoles(
      contacts.find((contact) => contact.id === nextContactId)?.roles ?? [],
    );
    if (suggestion) setType(suggestion);
    setTypeWasChosen(false);
  };
  const suggestedType = typeWasChosen
    ? null
    : suggestOpportunityTypeForRoles(
        contacts.find((contact) => contact.id === selectedContactId)?.roles ??
          [],
      );
  const draftType = suggestedType ?? type;
  // A seller can genuinely have two properties, so this warns rather than blocks:
  // the duplicate that bites is the accidental one, made because another screen
  // refused the record the advisor was really after.
  const duplicateOpportunity = selectedContactId
    ? opportunities.find(
        (item) =>
          item.subjectContactId === selectedContactId &&
          item.type === draftType &&
          activeStages.includes(item.stage),
      )
    : undefined;
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const matchingOpportunities = opportunities.filter((opportunity) => {
    if (typeFilter !== "all" && opportunity.type !== typeFilter) return false;
    if (!normalizedSearch) return true;
    return [
      opportunity.subjectContactName,
      opportunityTypeLabels[opportunity.type],
      ...opportunityHighlights(opportunity),
    ].some((value) =>
      value.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
    );
  });
  const scopedOpportunities = opportunitiesForJourney(matchingOpportunities, journeyFilter);
  const outcomeCounts = opportunityListSummary(scopedOpportunities);
  const visibleOpportunities = scopedOpportunities.filter((opportunity) => {
    if (stageFilter !== "all" && opportunity.stage !== stageFilter) return false;
    if (actionFilter === "missing") return opportunity.nextActionAt === null;
    if (actionFilter === "overdue") {
      return (
        opportunity.nextActionAt !== null &&
        opportunity.nextActionAt < referenceTime
      );
    }
    return true;
  });
  const openOpportunities = visibleOpportunities.filter((item) =>
    activeStages.includes(item.stage),
  );
  const scopedOpenOpportunities = scopedOpportunities.filter((item) =>
    activeStages.includes(item.stage),
  );
  const displayedOpportunities =
    outcomeFilter === "open"
      ? openOpportunities
      : visibleOpportunities.filter((item) => item.stage === outcomeFilter);
  const matchesQuery = useQuery({ ...portfolioMatchesQueryOptions, enabled: displayedOpportunities.some(isOpenRequirement), refetchInterval: 60_000 });
  const matchSummaries = useMemo(() => summarizeOpportunityMatches(matchesQuery.data ?? { matches: [], nearMisses: [] }), [matchesQuery.data]);
  const wonCount = outcomeCounts.won;
  const lostCount = outcomeCounts.lost;
  const nextOpportunity = outcomeFilter === "open"
    ? [...displayedOpportunities].sort((left, right) => {
        if (left.nextActionAt === null && right.nextActionAt !== null) return -1;
        if (left.nextActionAt !== null && right.nextActionAt === null) return 1;
        if (left.nextActionAt !== right.nextActionAt)
          return (left.nextActionAt ?? 0) - (right.nextActionAt ?? 0);
        return left.stageEnteredAt - right.stageEnteredAt;
      })[0]
    : undefined;
  const missingActionCount = scopedOpportunities.filter(
    (item) => activeStages.includes(item.stage) && item.nextActionAt === null,
  ).length;
  const overdueCount = scopedOpportunities.filter(
    (item) =>
      activeStages.includes(item.stage) &&
      item.nextActionAt !== null &&
      item.nextActionAt < referenceTime,
  ).length;
  const averageStageDays = scopedOpenOpportunities.length
    ? scopedOpenOpportunities.reduce(
        (sum, item) =>
          sum +
          Math.max(
            0,
            Math.floor((referenceTime - item.stageEnteredAt) / 86_400_000),
          ),
        0,
      ) / scopedOpenOpportunities.length
    : 0;

  function selectOutcome(next: OpportunityOutcomeFilter) {
    setOutcomeFilter(next);
    if (next !== "open") {
      setStageFilter("all");
      setActionFilter("all");
    }
  }

  function recordActionSummary(opportunity: OpportunityRecord): string {
    if (opportunity.stage === "won") {
      if (isOwnerOpportunity(opportunity.type))
        return opportunity.propertyId
          ? "Portföye dönüştü"
          : "Portföy bilgileri bekliyor";
      return "Müşteri kazanıldı";
    }
    if (opportunity.stage === "lost")
      return opportunity.lostKind === "duplicate"
        ? "Mükerrer kayıt kapatıldı"
        : "Kayıt kapatıldı";
    return opportunity.nextActionAt
      ? `${opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Aksiyon"} · ${dateTime(opportunity.nextActionAt)}`
      : "Sonraki aksiyon yok";
  }

  function closeDetail() {
    setSelected(null);
    if (requestedOpportunityId) setDismissedDeepLink(requestedOpportunityId);
  }
  useSheetDismiss(Boolean(activeSelected), closeDetail);
  useSheetDismiss(activeCreateOpen, closeCreate);
  useSheetDismiss(Boolean(moving), () => setMoving(null));
  useSheetDismiss(Boolean(correcting), () => setCorrecting(null));
  useSheetDismiss(Boolean(criteriaEditing), () => setCriteriaEditing(null));

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ...(moving
        ? [
            queryClient.invalidateQueries({
              queryKey: apiQueryKeys.opportunityDetail(moving.id),
            }),
          ]
        : []),
    ]);
  }

  function openCriteriaEditor(opportunity: OpportunityRecord) {
    const current = withCurrentContactMemory(detailQuery.data?.opportunity.id === opportunity.id ? detailQuery.data.opportunity : opportunity, contacts);
    const preferences = preferencesFor(current);
    setCriteriaAddressError(null);
    setCriteriaEditing(current);
    setCriteriaForm({
      locationRequired: preferences.locationRequired ?? false,
      authorizationType: current.ownerDetails?.authorizationType ?? "unknown",
      motivation: current.ownerDetails?.motivation ?? "",
      locations: current.ownerDetails?.address ?? preferences.preferredLocations.join(", "),
      propertyTypes: preferences.propertyTypes,
      budgetMin: preferences.budgetRange?.min?.toString() ?? "",
      budgetMax: preferences.budgetRange?.max?.toString() ?? "",
      currency: preferences.budgetRange?.currency ?? "TRY",
      bedrooms: preferences.bedroomCountMin?.toString() ?? "",
      livingRooms: preferences.livingRoomCountMin?.toString() ?? "",
      areaMin: preferences.areaMinM2?.toString() ?? "",
      mustHaves: preferences.mustHaves.join(", "),
      timeline: preferences.timeline ?? "",
    });
    closeDetail();
    setError(null);
  }

  async function saveCriteria(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !criteriaEditing) return;
    const current = preferencesFor(criteriaEditing);
    const onlyLand = criteriaForm.propertyTypes.length === 1 && criteriaForm.propertyTypes[0] === "land";
    const budgetMin = parseMoneyInput(criteriaForm.budgetMin);
    const budgetMax = parseMoneyInput(criteriaForm.budgetMax);
    const parsed = opportunityCriteriaUpdateSchema.safeParse({
      opportunityId: criteriaEditing.id,
      ...(isOwnerOpportunity(criteriaEditing.type) ? { ownerDetails: { address: criteriaForm.locations, authorizationType: criteriaForm.authorizationType, motivation: criteriaForm.motivation.trim() || null } } : {}),
      preferences: {
        ...current,
        transactionType: opportunityTransactionType(criteriaEditing.type),
        propertyTypes: criteriaForm.propertyTypes,
        preferredLocations: criteriaForm.locations.split(",").map((item) => item.trim()).filter(Boolean),
        locationRequired: criteriaForm.locationRequired,
        budgetRange: budgetMin !== null || budgetMax !== null ? { min: isOwnerOpportunity(criteriaEditing.type) ? budgetMax : budgetMin, max: budgetMax, currency: criteriaForm.currency } : null,
        bedroomCountMin: onlyLand ? null : optionalNumber(criteriaForm.bedrooms),
        livingRoomCountMin: onlyLand ? null : optionalNumber(criteriaForm.livingRooms),
        roomCountMin: onlyLand ? null : optionalNumber(criteriaForm.bedrooms),
        areaMinM2: optionalNumber(criteriaForm.areaMin),
        mustHaves: criteriaForm.mustHaves.split(",").map((item) => item.trim()).filter(Boolean),
        timeline: criteriaForm.timeline.trim() || null,
      },
    });
    if (!parsed.success) {
      const addressError = parsed.error.issues.find((issue) => issue.path.join(".") === "ownerDetails.address")?.message ?? null;
      setCriteriaAddressError(addressError);
      setError(addressError ? null : parsed.error.issues[0]?.message ?? "Kriterleri kontrol et.");
      if (addressError) {
        const field = event.currentTarget.elements.namedItem("criteria-address");
        if (field instanceof HTMLInputElement) field.focus();
      }
      return;
    }
    setCriteriaAddressError(null);
    setPending(true); setError(null);
    try {
      await updateOpportunityCriteria(session, parsed.data);
      const opportunityId = criteriaEditing.id;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.opportunityDetail(opportunityId) }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.portfolioMatches }), queryClient.invalidateQueries({ queryKey: apiQueryKeys.matchNotifications }),
      ]);
      await queryClient.fetchQuery({ queryKey: apiQueryKeys.opportunityDetail(opportunityId), queryFn: () => getOpportunityDetail(opportunityId), staleTime: 0 });
      setCriteriaEditing(null);
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const submitted = new FormData(event.currentTarget);
    const submittedActionAt = String(submitted.get("nextActionAt") ?? actionAt);
    const parsed = opportunityDraftSchema.safeParse({
      subjectContactId: selectedContactId,
      type: draftType,
      ...(!isOwnerOpportunity(draftType) ? { criteria: { ...emptyVoicePropertyPreferences, transactionType: opportunityTransactionType(draftType), preferredLocations: demandLocation.split(",").map((item) => item.trim()).filter(Boolean), propertyTypes: demandPropertyType ? [demandPropertyType] : [], budgetRange: parseMoneyInput(demandBudget) === null ? null : { min: null, max: parseMoneyInput(demandBudget), currency: "TRY" } } } : {}),
      nextActionType: actionType,
      nextActionAt: new Date(submittedActionAt).getTime(),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "Fırsat bilgilerini kontrol et.",
      );
    setPending(true);
    setError(null);
    try {
      const created = await saveOpportunity(session, parsed.data);
      setJourneyFilter(
        parsed.data.type === "buyer_requirement" || parsed.data.type === "tenant_requirement"
          ? "requirement"
          : "owner",
      );
      closeCreate();
      await invalidate();
      setSelected(created);
      setDemandLocation(""); setDemandPropertyType(""); setDemandBudget("");
      setStageFilter("all"); setTypeFilter("all"); setSearch("");
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  function openMove(opportunity: OpportunityRecord) {
    const next = nextOpportunityStages(opportunity.stage)[0];
    if (!next) return;
    setMoving(opportunity);
    setTargetStage(next);
    setActionType(opportunity.nextActionType ?? "call");
    setActionAt(localDateTimeFrom(opportunity.nextActionAt));
    setReason("");
    setLostReason("");
    setError(null);
  }

  async function move(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !moving) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const submitted = new FormData(event.currentTarget);
    const submittedActionAt = String(submitted.get("nextActionAt") ?? actionAt);
    const parsed = opportunityTransitionSchema.safeParse({
      opportunityId: moving.id,
      toStage: targetStage,
      reason: reason.trim() || null,
      lostReason: targetStage === "lost" ? lostReason.trim() || null : null,
      lostKind: targetStage === "lost" ? lostKind : "lost",
      nextActionType: terminal ? null : actionType,
      nextActionAt: terminal ? null : new Date(submittedActionAt).getTime(),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "Aşama bilgilerini kontrol et.",
      );
    setPending(true);
    setError(null);
    const completedOpportunity = moving;
    try {
      await moveOpportunity(session, parsed.data);
      await invalidate();
      setMoving(null);
      if (
        targetStage === "won" &&
        isOwnerOpportunity(completedOpportunity.type)
      ) {
        router.push(
          `/listings?action=complete-won&opportunityId=${encodeURIComponent(completedOpportunity.id)}`,
        );
      }
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  function openCorrection(opportunity: OpportunityRecord) {
    setCorrecting(opportunity);
    setTargetStage(opportunity.stage);
    setActionType(opportunity.nextActionType ?? "call");
    setActionAt(localDateTimeFrom(opportunity.nextActionAt));
    setCorrectionReason("");
    setLostReason("");
    setError(null);
  }

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !correcting) return;
    const terminal = targetStage === "won" || targetStage === "lost";
    const parsed = opportunityStageCorrectionSchema.safeParse({
      opportunityId: correcting.id,
      toStage: targetStage,
      reason: correctionReason,
      lostReason: targetStage === "lost" ? lostReason.trim() || null : null,
      lostKind: targetStage === "lost" ? lostKind : "lost",
      nextActionType: terminal ? null : actionType,
      nextActionAt: terminal ? null : new Date(actionAt).getTime(),
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "Düzeltme bilgilerini kontrol et.",
      );
    setPending(true);
    setError(null);
    const completedOpportunity = correcting;
    try {
      await correctOpportunity(session, parsed.data);
      await invalidate();
      setCorrecting(null);
      if (
        targetStage === "won" &&
        isOwnerOpportunity(completedOpportunity.type)
      ) {
        router.push(
          `/listings?action=complete-won&opportunityId=${encodeURIComponent(completedOpportunity.id)}`,
        );
      }
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <header className="page-header contacts-header">
        <div>
          <p className="eyebrow">TALEPTEN KAPANIŞA · {scopedOpenOpportunities.length} AÇIK İŞ</p>
          <h1>İşler</h1>
          <p className="context-sentence">
            Fırsat, sunum, gezi ve teklif tek akışta. Sıralama aksiyon
            aciliyetine göre.
          </p>
        </div>
        <div className="header-actions">
          {nextOpportunity ? (
            <button
              className="secondary-action inline-action"
              disabled={pending}
              onClick={() => openMove(nextOpportunity)}
              type="button"
            >
              {nextOpportunity.subjectContactName}: ilerlet{" "}
              <ArrowRight size={15} />
            </button>
          ) : null}
          <button
            className="primary-action inline-action"
            disabled={!contacts.length}
            onClick={() => {
              setCreateOpen(true);
              setError(null);
            }}
            type="button"
          >
            <Plus size={18} /> Yeni iş
          </button>
        </div>
      </header>
      {error && !activeCreateOpen && !moving ? (
        <p className="form-error notice">{error}</p>
      ) : null}
      {opportunities.length ? (
        <div className="segmented-control" aria-label="İş yolu">
          {opportunityJourneyFilters.map((value) => {
            const count = opportunityListSummary(opportunitiesForJourney(matchingOpportunities, value)).total;
            return (
            <button
              key={value}
              className={journeyFilter === value ? "selected" : ""}
              onClick={() => {
                setJourneyFilter(value);
                setTypeFilter("all");
                setStageFilter("all");
              }}
              type="button"
            >
              {opportunityJourneyLabels[value]} <span className="segmented-count">{count}</span>
            </button>
            );
          })}
        </div>
      ) : null}
      {opportunities.length ? (
        <>
          <div className="opportunity-insights">
            <button
              aria-pressed={actionFilter === "missing"}
              className={missingActionCount ? "warning" : ""}
              onClick={() => {
                selectOutcome("open");
                setActionFilter((current) =>
                  current === "missing" ? "all" : "missing",
                );
              }}
              type="button"
            >
              {missingActionCount} işte sonraki aksiyon yok
            </button>
            <button
              aria-pressed={actionFilter === "overdue"}
              className={overdueCount ? "danger" : ""}
              onClick={() => {
                selectOutcome("open");
                setActionFilter((current) =>
                  current === "overdue" ? "all" : "overdue",
                );
              }}
              type="button"
            >
              {overdueCount} aksiyon gecikti
            </button>
            <span>
              Aşamada ortalama{" "}
              <strong>
                {averageStageDays.toLocaleString("tr-TR", {
                  maximumFractionDigits: 1,
                })}{" "}
                gün
              </strong>
            </span>
          </div>
          {/* The board's real value was seeing the whole path at once. A strip
              keeps that and gives the empty stages a line instead of a column. */}
          <section className="work-stage-strip" aria-label="Yolun neresinde">
            {activeStages.map((stage) => {
              const items = scopedOpportunities.filter((item) => item.stage === stage);
              const selectedStage = stageFilter === stage;
              return (
                <button
                  key={stage}
                  aria-pressed={selectedStage}
                  className={`work-stage-step stage-tone-${stageTone[stage] ?? "deed"}${selectedStage ? " selected" : ""}`}
                  onClick={() => {
                    selectOutcome("open");
                    setStageFilter((current) => (current === stage ? "all" : stage));
                  }}
                  type="button"
                >
                  <strong>{items.length}</strong>
                  <span>
                    {(journeyFilter === "all" ? neutralOpportunityStageLabel(stage) : opportunityStageLabel(
                      stage,
                      journeyFilter === "requirement" ? "buyer_requirement" : "seller_listing",
                    ))}
                  </span>
                  <em aria-hidden />
                </button>
              );
            })}
            <span className="work-stage-divider" aria-hidden>
              <ArrowRight size={14} />
            </span>
            <button
              aria-pressed={outcomeFilter === "won"}
              className="work-stage-step stage-tone-good"
              onClick={() => selectOutcome("won")}
              type="button"
            >
              <strong>{wonCount}</strong>
              <span>Kazanıldı</span>
              <em aria-hidden />
            </button>
          </section>
          <div className="opportunity-filterbar">
            <label className="contact-search">
              <Search size={16} aria-hidden />
              <SpInput
                aria-label="Fırsatlarda ara"
                placeholder="Kişi, bölge veya talep ara"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Fırsat türü</span>
              <SpSelect
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as OpportunityType | "all")
                }
              >
                <option value="all">Tüm fırsat türleri</option>
                {opportunityTypes.map((item) => (
                  <option key={item} value={item}>
                    {opportunityTypeLabels[item]}
                  </option>
                ))}
              </SpSelect>
            </label>
            <div
              className="segmented-control opportunity-outcome-filter"
              aria-label="Fırsat durumu"
            >
              <button
                className={outcomeFilter === "open" ? "selected" : ""}
                onClick={() => selectOutcome("open")}
                type="button"
              >
                {opportunityOutcomeLabels.open} ·{" "}
                {
                  scopedOpenOpportunities.length
                }
              </button>
              <button
                className={outcomeFilter === "won" ? "selected" : ""}
                onClick={() => selectOutcome("won")}
                type="button"
              >
                {opportunityOutcomeLabels.won} · {wonCount}
              </button>
              <button
                className={outcomeFilter === "lost" ? "selected" : ""}
                onClick={() => selectOutcome("lost")}
                type="button"
              >
                {opportunityOutcomeLabels.lost} · {lostCount}
              </button>
            </div>
          </div>
        </>
      ) : null}
      {opportunitiesQuery.isPending ? (
        <div className="content-state">
          <RefreshCw className="spin" size={22} /> Fırsatlar yükleniyor…
        </div>
      ) : opportunitiesQuery.error ? (
        <p className="form-error notice">
          {messageFrom(opportunitiesQuery.error)}
        </p>
      ) : opportunities.length === 0 ? (
        <SpCard className="empty-state">
          <div className="card-icon secondary">
            <BriefcaseBusiness size={20} />
          </div>
          <h2>İlk fırsatını oluştur</h2>
          <p>
            Kayıtlı bir kişiyi talebe dönüştür ve sıradaki gerçek işi belirle.
          </p>
          {contacts.length ? (
            <button
              className="secondary-action"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              Fırsat oluştur
            </button>
          ) : (
            <p>Önce bir kişi eklemelisin.</p>
          )}
        </SpCard>
      ) : displayedOpportunities.length === 0 ? (
        <SpCard className="empty-state">
          <div className="card-icon secondary">
            <Search size={20} />
          </div>
          <h2>
            {outcomeFilter === "open"
              ? "Eşleşen açık fırsat yok"
              : outcomeFilter === "won"
                ? "Eşleşen kazanılmış kayıt yok"
                : "Eşleşen kaybedilmiş kayıt yok"}
          </h2>
          <p>Arama metnini veya filtreleri değiştir.</p>
          <button
            className="secondary-action"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setActionFilter("all");
            }}
            type="button"
          >
            Filtreleri temizle
          </button>
        </SpCard>
      ) : outcomeFilter === "open" ? (
        <section className="work-queue" aria-label="Açık işler">
          {groupWorkByUrgency(openOpportunities, referenceTime).map((group) => (
            <div className="work-group" key={group.urgency}>
              <p className={`work-group-heading tone-${group.urgency}`}>
                <span className="eyebrow">{workUrgencyLabels[group.urgency].toLocaleUpperCase("tr-TR")}</span>
                <span>{group.items.length}</span>
              </p>
              <ul className="work-list">
                {group.items.map((opportunity) => {
                  const progress = workPathProgress(opportunity.stage);
                  const stageDays = Math.max(0, Math.floor((referenceTime - opportunity.stageEnteredAt) / 86_400_000));
                  const highlights = opportunityHighlights(opportunity);
                  const late = opportunity.nextActionAt !== null && opportunity.nextActionAt < referenceTime;
                  return (
                    <li className={`work-row urgency-${group.urgency}`} key={opportunity.id}>
                      <span className="work-dot" aria-hidden />
                      <div className="work-row-identity">
                        <button className="work-row-open" onClick={() => setSelected(opportunity)} type="button">
                          <span className="work-row-head">
                            <strong>{opportunity.subjectContactName}</strong>
                            <span className={`stage-badge stage-${opportunity.type === "seller_listing" || opportunity.type === "landlord_listing" ? "won" : "first_contact"}`}>
                              {opportunityTypeLabels[opportunity.type]}
                            </span>
                          </span>
                          <small>{highlights.length ? highlights.join(" · ") : contactMemoryLine(opportunity.subjectContactMemory) ?? "Kriterler henüz kaydedilmedi"}</small>
                        </button>
                        <RequirementMatchIndicator opportunity={opportunity} summary={matchSummaries.get(opportunity.id)} status={matchesQuery.status} />
                      </div>
                      <span className="work-path">
                        <span className="work-path-pips" aria-hidden>
                          {workPathStages.map((pathStage, index) => (
                            <i className={index < progress ? "on" : ""} key={pathStage} />
                          ))}
                        </span>
                        <small>
                          {opportunityStageLabel(opportunity.stage, opportunity.type)} · {stageDays} gündür bu aşamada
                        </small>
                      </span>
                      <span className="work-next">
                        <strong className={late || !opportunity.nextActionAt ? "overdue-text" : undefined}>
                          {opportunity.nextActionType ? nextActionTypeLabels[opportunity.nextActionType] : "Sonraki aksiyon yok"}
                        </strong>
                        <small className={late || !opportunity.nextActionAt ? "overdue-text" : undefined}>{dueChip(opportunity.nextActionAt, referenceTime)}</small>
                      </span>
                      <div className="work-row-actions">
                        <OpportunityAction opportunity={opportunity} compact />
                      <button className="primary-action compact-action work-advance" onClick={() => openMove(opportunity)} type="button">
                        İlerlet <ArrowRight size={13} />
                      </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <section className="opportunity-list-table">
          <div className="opportunity-list-head">
            <span>Kişi</span>
            <span>Tür</span>
            <span>Aşama</span>
            <span>Sonuç</span>
            <span>Aşama süresi</span>
          </div>
          {displayedOpportunities.map((opportunity) => (
            <button
              key={opportunity.id}
              onClick={() => setSelected(opportunity)}
              type="button"
            >
              <strong>{opportunity.subjectContactName}</strong>
              <span>{opportunityTypeLabels[opportunity.type]}</span>
              <span className={`stage-badge stage-${opportunity.stage}`}>
                {opportunityStageLabel(opportunity.stage, opportunity.type)}
              </span>
              <span>{recordActionSummary(opportunity)}</span>
              <span>
                {Math.max(
                  0,
                  Math.floor(
                    (referenceTime - opportunity.stageEnteredAt) / 86_400_000,
                  ),
                )}{" "}
                gün
              </span>
            </button>
          ))}
        </section>
      )}

      {listingsQuery.data?.length ? (
        <div className="work-closing" id="closing">
          <ClosingSection listings={listingsQuery.data} />
        </div>
      ) : null}

      {activeSelected ? (
        <div
          className="sheet-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDetail();
          }}
        >
          <section className="form-sheet" role="dialog" aria-modal="true">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">FIRSAT DETAYI</p>
                <h2>{activeSelected.subjectContactName}</h2>
                <p className="context-sentence">
                  {opportunityTypeLabels[activeSelected.type]}
                </p>
              </div>
              <button
                className="icon-action"
                aria-label="Kapat"
                onClick={closeDetail}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            {detailQuery.isPending ? (
              <div className="content-state">
                <RefreshCw className="spin" size={20} /> Detay yükleniyor…
              </div>
            ) : detailQuery.error ? (
              <p className="form-error">{messageFrom(detailQuery.error)}</p>
            ) : (
              <>
                <div className="detail-summary">
                  <span className={`stage-badge stage-${activeSelected.stage}`}>
                    {opportunityStageLabel(
                      activeSelected.stage,
                      activeSelected.type,
                    )}
                  </span>
                  <p>
                    Bu aşamada{" "}
                    {Math.max(
                      0,
                      Math.floor(
                        (referenceTime - activeSelected.stageEnteredAt) /
                          86_400_000,
                      ),
                    )}{" "}
                    gündür.
                  </p>
                  {activeSelected.nextActionAt &&
                  activeSelected.nextActionType ? (
                    <p>
                      <strong>Sonraki aksiyon:</strong>{" "}
                      {nextActionTypeLabels[activeSelected.nextActionType]} ·{" "}
                      {dateTime(activeSelected.nextActionAt)}
                    </p>
                  ) : (
                    <p className="compliance-warning">
                      Sonraki aksiyon belirlenmedi.
                    </p>
                  )}
                  {opportunityHighlights(
                    withCurrentContactMemory(detailQuery.data?.opportunity ?? activeSelected, contacts),
                  ).length ? (
                    <div className="opportunity-highlights">
                      {opportunityHighlights(
                        withCurrentContactMemory(detailQuery.data?.opportunity ?? activeSelected, contacts),
                      ).map((highlight) => (
                        <span key={highlight}>{highlight}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <ol className="stage-timeline">
                  {detailQuery.data?.stageEvents.map((stageEvent) => (
                    <li key={stageEvent.id}>
                      <div className="timeline-dot" />
                      <div>
                        <strong>
                          {opportunityStageLabel(
                            stageEvent.toStage as OpportunityStage,
                            activeSelected.type,
                          )}
                        </strong>
                        <time>{dateTime(stageEvent.occurredAt)}</time>
                        {stageEvent.reason ? <p>{stageEvent.reason}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
                {!isOwnerOpportunity(activeSelected.type) ? <RequirementMatches opportunity={detailQuery.data?.opportunity ?? activeSelected} /> : null}<div className="opportunity-detail-actions"><OpportunityAction opportunity={activeSelected} />
                  <Link
                    className="secondary-action inline-link"
                    href={`/capture?contactId=${encodeURIComponent(activeSelected.subjectContactId)}`}
                  >
                    Teması kaydet
                  </Link>
                  <button
                    className="secondary-action inline-action"
                    onClick={() => openCriteriaEditor(withCurrentContactMemory(detailQuery.data?.opportunity ?? activeSelected, contacts))}
                    type="button"
                  >
                    {isOwnerOpportunity(activeSelected.type) ? opportunityCriteriaCopy.ownerAction : opportunityCriteriaCopy.demandAction}
                  </button>
                  <button
                    className="secondary-action inline-action"
                    onClick={() => {
                      openCorrection(activeSelected);
                      closeDetail();
                    }}
                    type="button"
                  >
                    Aşamayı düzelt
                  </button>
                  {activeSelected.stage === "won" &&
                  isOwnerOpportunity(activeSelected.type) &&
                  !activeSelected.propertyId ? (
                    <Link
                      className="primary-action inline-link"
                      href={`/listings?action=complete-won&opportunityId=${encodeURIComponent(activeSelected.id)}`}
                    >
                      Portföyü tamamla <ArrowRight size={15} />
                    </Link>
                  ) : nextOpportunityStages(activeSelected.stage).length ? (
                    <button
                      className="primary-action inline-action"
                      onClick={() => {
                        openMove(activeSelected);
                        closeDetail();
                      }}
                      type="button"
                    >
                      Aşamayı ilerlet <ArrowRight size={15} />
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {criteriaEditing ? (
        <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setCriteriaEditing(null); }}>
          <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="criteria-title">
            <div className="sheet-heading">
              <div><p className="eyebrow">{isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.ownerTitle : opportunityCriteriaCopy.demandTitle}</p><h2 id="criteria-title">{criteriaEditing.subjectContactName}</h2><p className="context-sentence">Bu bilgiler eşleşme motorunda ve fırsat detayında birlikte kullanılır.</p></div>
              <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={() => setCriteriaEditing(null)} type="button"><X size={20} /></button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={saveCriteria}>{isOwnerOpportunity(criteriaEditing.type) ? <><label>{opportunityCriteriaCopy.authorization}<SpSelect value={criteriaForm.authorizationType} onChange={(event) => setCriteriaForm((current) => ({ ...current, authorizationType: event.target.value as OwnerOpportunityDetails["authorizationType"] }))}>{portfolioAuthorizationTypes.map((item) => <option key={item} value={item}>{portfolioAuthorizationLabels[item]}</option>)}</SpSelect></label><label>{opportunityCriteriaCopy.motivation}<SpTextarea value={criteriaForm.motivation} onChange={(event) => setCriteriaForm((current) => ({ ...current, motivation: event.target.value }))} /></label></> : <label className="check-label"><SpInput type="checkbox" checked={criteriaForm.locationRequired} onChange={(event) => setCriteriaForm((current) => ({ ...current, locationRequired: event.target.checked }))} />{opportunityCriteriaCopy.locationRequired}</label>}
              <SpField label={isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.address : "Bölgeler · virgülle ayır"} hint={isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.addressHint : undefined} error={criteriaAddressError}>
                <SpInput name="criteria-address" aria-label={isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.address : "Bölgeler · virgülle ayır"} aria-required={isOwnerOpportunity(criteriaEditing.type)} aria-invalid={Boolean(criteriaAddressError)} value={criteriaForm.locations} onChange={(event) => { setCriteriaAddressError(null); setCriteriaForm((current) => ({ ...current, locations: event.target.value })); }} placeholder={opportunityCriteriaCopy.locationPlaceholder} />
              </SpField>
              <fieldset><legend>Mülk türleri</legend><div className="chip-row">{propertyTypes.map((item) => <button className={`choice-chip ${criteriaForm.propertyTypes.includes(item) ? "selected" : ""}`} key={item} aria-pressed={criteriaForm.propertyTypes.includes(item)} onClick={() => setCriteriaForm((current) => ({ ...current, propertyTypes: current.propertyTypes.includes(item) ? current.propertyTypes.filter((value) => value !== item) : [...current.propertyTypes, item] }))} type="button">{propertyTypeLabels[item]}</button>)}</div></fieldset>
              <div className="form-row">
                {!isOwnerOpportunity(criteriaEditing.type) ? <label>Minimum bütçe<MoneyField currency={criteriaForm.currency} value={criteriaForm.budgetMin} onChange={(value) => setCriteriaForm((current) => ({ ...current, budgetMin: value }))} /></label> : null}
                <label>{isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.expectedPrice : "Maksimum bütçe"}<MoneyField currency={criteriaForm.currency} value={criteriaForm.budgetMax} onChange={(value) => setCriteriaForm((current) => ({ ...current, budgetMax: value }))} /></label>
                <label>Para birimi<SpSelect value={criteriaForm.currency} onChange={(event) => setCriteriaForm((current) => ({ ...current, currency: event.target.value as CurrencyCode }))}>{currencyCodes.map((item) => <option key={item}>{item}</option>)}</SpSelect></label>
              </div>
              <div className="form-row">
                {criteriaForm.propertyTypes.length === 1 && criteriaForm.propertyTypes[0] === "land" ? null : <><label>Yatak odası<SpInput min="0" type="number" value={criteriaForm.bedrooms} onChange={(event) => setCriteriaForm((current) => ({ ...current, bedrooms: event.target.value }))} /></label>
                <label>Salon<SpInput min="0" type="number" value={criteriaForm.livingRooms} onChange={(event) => setCriteriaForm((current) => ({ ...current, livingRooms: event.target.value }))} /></label></>}
                <label>{isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.area : "Minimum m²"}<SpInput min="1" type="number" value={criteriaForm.areaMin} onChange={(event) => setCriteriaForm((current) => ({ ...current, areaMin: event.target.value }))} /></label>
              </div>
              <label>{isOwnerOpportunity(criteriaEditing.type) ? opportunityCriteriaCopy.features : "Olmazsa olmazlar · virgülle ayır"}<SpInput value={criteriaForm.mustHaves} onChange={(event) => setCriteriaForm((current) => ({ ...current, mustHaves: event.target.value }))} placeholder="Havuz, otopark" /></label>
              <label>Zamanlama<SpInput value={criteriaForm.timeline} onChange={(event) => setCriteriaForm((current) => ({ ...current, timeline: event.target.value }))} placeholder="1 Ekim'de taşınacak" /></label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Kriterleri kaydet"}</button>
            </form>
          </section>
        </div>
      ) : null}

      {activeCreateOpen ? (
        <div
          className="sheet-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeCreate();
          }}
        >
          <section className="form-sheet" role="dialog" aria-modal="true">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">YENİ TALEP</p>
                <h2>Fırsat oluştur</h2>
              </div>
              <button
                className="icon-action"
                aria-label="Kapat"
                onClick={closeCreate}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={create}>
              <ContactCombobox
                contacts={contacts}
                value={selectedContactId}
                onChange={chooseContact}
              />
              <label>
                Fırsat türü
                <SpSelect
                  value={draftType}
                  onChange={(event) => {
                    setType(event.target.value as OpportunityType);
                    setTypeWasChosen(true);
                  }}
                >
                  {opportunityTypes.map((item) => (
                    <option key={item} value={item}>
                      {opportunityTypeLabels[item]}
                    </option>
                  ))}
                </SpSelect>
              </label>
              {!isOwnerOpportunity(draftType) ? <><label>Aranan bölgeler<SpInput value={demandLocation} onChange={(event) => setDemandLocation(event.target.value)} placeholder="Örn. Kadıovacık" /></label><label>Aranan mülk türü<SpSelect value={demandPropertyType} onChange={(event) => setDemandPropertyType(event.target.value as PropertyType | "")}><option value="">Henüz bilinmiyor</option>{propertyTypes.map((item) => <option key={item} value={item}>{propertyTypeLabels[item]}</option>)}</SpSelect></label><label>Maksimum bütçe · isteğe bağlı<MoneyField currency="TRY" value={demandBudget} onChange={setDemandBudget} /></label><p className="privacy-hint">Teklif tutarı bütçe sınırı değildir. Bilinmeyen kriterleri boş bırak.</p></> : null}
              <label>
                Sonraki adım
                <SpSelect
                  value={actionType}
                  onChange={(event) =>
                    setActionType(event.target.value as NextActionType)
                  }
                >
                  {nextActionTypes.map((item) => (
                    <option key={item} value={item}>
                      {nextActionTypeLabels[item]}
                    </option>
                  ))}
                </SpSelect>
              </label>
              <QuickDateField value={actionAt} onChange={setActionAt} />
              <SpInput name="nextActionAt" type="hidden" value={actionAt} />
              {duplicateOpportunity ? (
                <p className="privacy-hint">
                  Bu kişinin zaten açık bir “{opportunityTypeLabels[draftType]}”
                  fırsatı var (
                  {opportunityStageLabel(
                    duplicateOpportunity.stage,
                    duplicateOpportunity.type,
                  )}
                  ). Ayrı bir mülk için ikincisini açabilirsiniz.
                </p>
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
              <button
                className="primary-action auth-submit"
                disabled={pending || !selectedContactId}
                type="submit"
              >
                {pending
                  ? "Oluşturuluyor…"
                  : duplicateOpportunity
                    ? "Yine de oluştur"
                    : "Fırsatı oluştur"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {moving ? (
        <div
          className="sheet-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setMoving(null);
          }}
        >
          <section className="form-sheet" role="dialog" aria-modal="true">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">AŞAMA GEÇİŞİ</p>
                <h2>{moving.subjectContactName}</h2>
              </div>
              <button
                className="icon-action"
                aria-label="Kapat"
                onClick={() => setMoving(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={move}>
              <label>
                Yeni aşama
                <SpSelect
                  value={targetStage}
                  onChange={(event) =>
                    setTargetStage(event.target.value as OpportunityStage)
                  }
                >
                  {nextOpportunityStages(moving.stage).map((stage) => (
                    <option key={stage} value={stage}>
                      {opportunityStageLabel(stage, moving.type)}
                    </option>
                  ))}
                </SpSelect>
              </label>
              <label>
                Geçiş notu <span className="optional">isteğe bağlı</span>
                <SpTextarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              {targetStage === "lost" ? (
                <>
                  <label>
                    Kaydı neden kapatıyorsun?
                    <SpSelect
                      value={lostKind}
                      onChange={(event) =>
                        setLostKind(event.target.value as "lost" | "duplicate")
                      }
                    >
                      <option value="lost">İş kaybedildi</option>
                      <option value="duplicate">
                        Mükerrer kayıt — kaybedilmiş bir iş değil
                      </option>
                    </SpSelect>
                  </label>
                  <label>
                    {lostKind === "duplicate" ? "Açıklama" : "Kayıp nedeni"}
                    <SpTextarea
                      required
                      value={lostReason}
                      onChange={(event) => setLostReason(event.target.value)}
                    />
                  </label>
                  {lostKind === "duplicate" ? (
                    <p className="privacy-hint">
                      Mükerrer kapatılan kayıtlar kayıp istatistiğine girmez.
                    </p>
                  ) : null}
                </>
              ) : targetStage !== "won" ? (
                <>
                  <label>
                    Sonraki adım
                    <SpSelect
                      value={actionType}
                      onChange={(event) =>
                        setActionType(event.target.value as NextActionType)
                      }
                    >
                      {nextActionTypes.map((item) => (
                        <option key={item} value={item}>
                          {nextActionTypeLabels[item]}
                        </option>
                      ))}
                    </SpSelect>
                  </label>
                  <QuickDateField value={actionAt} onChange={setActionAt} />
                  <SpInput name="nextActionAt" type="hidden" value={actionAt} />
                </>
              ) : (
                <p className="privacy-hint">
                  {isOwnerOpportunity(moving.type)
                    ? "Yetkiyi kaydettikten sonra adres, fiyat ve mülk bilgilerini tamamlayarak portföyü oluşturacaksın."
                    : "Bu kayıt müşteri talebi olarak sonuçlanır; kendi portföyüne mülk eklemez."}
                </p>
              )}
              {error ? <p className="form-error">{error}</p> : null}
              <button
                className="primary-action auth-submit"
                disabled={pending}
                type="submit"
              >
                {pending
                  ? "İlerletiliyor…"
                  : targetStage === "won" && isOwnerOpportunity(moving.type)
                    ? "Yetkiyi al ve portföyü tamamla"
                    : targetStage === "won"
                      ? "Talebi sonuçlandır"
                      : "Aşamayı kaydet"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
      {correcting ? (
        <div
          className="sheet-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCorrecting(null);
          }}
        >
          <section className="form-sheet" role="dialog" aria-modal="true">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">DENETİM İZLİ DÜZELTME</p>
                <h2>{correcting.subjectContactName}</h2>
              </div>
              <button
                className="icon-action"
                aria-label="Kapat"
                onClick={() => setCorrecting(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={correct}>
              <label>
                Doğru aşama
                <SpSelect
                  value={targetStage}
                  onChange={(event) =>
                    setTargetStage(event.target.value as OpportunityStage)
                  }
                >
                  {opportunityStages
                    .map((stage) => (
                      <option key={stage} value={stage}>
                        {opportunityStageLabel(stage, correcting.type)}
                      </option>
                    ))}
                </SpSelect>
              </label>
              <label>
                Düzeltme nedeni
                <SpTextarea
                  required
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                />
              </label>
              {targetStage === "lost" ? (
                <>
                  <label>
                    Kaydı neden kapatıyorsun?
                    <SpSelect
                      value={lostKind}
                      onChange={(event) =>
                        setLostKind(event.target.value as "lost" | "duplicate")
                      }
                    >
                      <option value="lost">İş kaybedildi</option>
                      <option value="duplicate">
                        Mükerrer kayıt — kaybedilmiş bir iş değil
                      </option>
                    </SpSelect>
                  </label>
                  <label>
                    {lostKind === "duplicate" ? "Açıklama" : "Kayıp nedeni"}
                    <SpTextarea
                      required
                      value={lostReason}
                      onChange={(event) => setLostReason(event.target.value)}
                    />
                  </label>
                  {lostKind === "duplicate" ? (
                    <p className="privacy-hint">
                      Mükerrer kapatılan kayıtlar kayıp istatistiğine girmez.
                    </p>
                  ) : null}
                </>
              ) : targetStage !== "won" ? (
                <>
                  <label>
                    Sonraki adım
                    <SpSelect
                      value={actionType}
                      onChange={(event) =>
                        setActionType(event.target.value as NextActionType)
                      }
                    >
                      {nextActionTypes.map((item) => (
                        <option key={item} value={item}>
                          {nextActionTypeLabels[item]}
                        </option>
                      ))}
                    </SpSelect>
                  </label>
                  <QuickDateField value={actionAt} onChange={setActionAt} />
                </>
              ) : null}
              <p className="privacy-hint">
                Eski aşama silinmez; düzeltme nedeni zaman çizelgesine eklenir.
              </p>
              {error ? <p className="form-error">{error}</p> : null}
              <p className="privacy-hint">{opportunityStageLabel(correcting.stage, correcting.type)} → {opportunityStageLabel(targetStage, correcting.type)}</p>
              <button className="primary-action auth-submit" disabled={pending || targetStage === correcting.stage || correctionReason.trim().length < 2}>
                Aşamayı düzelt
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
