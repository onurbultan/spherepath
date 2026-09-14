import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react-native";
import {
  apiQueryKeys,
  contributionKindLabels,
  contributionSummaryLine,
  summariseContributions,
  firstSpecialCategoryRefusal,
  knownPropertyDraftSchema,
  knownPropertySummary,
  propertyFeatureLabels,
  propertyFeatures,
  propertyTypeLabels,
  propertyTypes,
  specialCategoryRefusal,
  type ContactMemory,
  type KnownPropertyRecord,
  type PropertyFeature,
  type PropertyType,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpButton, SpChoice, SpField, SpInput, SpTextarea } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { space } from "@/shared/ui/tokens.generated";
import {
  archiveKnownProperty,
  listContributions,
  listKnownProperties,
  saveContactMemory,
  saveKnownProperty,
} from "../resources/contacts";

const numberOrNull = (value: string): number | null => value.trim() ? Number(value) : null;

/** Land has no rooms, and a form that asks for them invites a number nobody meant. */
const featuresForType = (type: PropertyType): readonly PropertyFeature[] =>
  type === "land" ? ["garden", "gated_community"] : propertyFeatures;

interface PropertyForm {
  propertyId: string | null;
  address: string;
  regionSlug: string;
  propertyType: PropertyType;
  roomCount: string;
  areaM2: string;
  features: PropertyFeature[];
  note: string;
}

const emptyProperty: PropertyForm = {
  propertyId: null, address: "", regionSlug: "", propertyType: "apartment",
  roomCount: "", areaM2: "", features: [], note: "",
};

function formFor(property: KnownPropertyRecord): PropertyForm {
  return {
    propertyId: property.id,
    address: property.address,
    regionSlug: property.regionSlug.replace(/-/gu, " "),
    propertyType: property.type,
    roomCount: property.roomCount === null ? "" : String(property.roomCount),
    areaM2: property.areaM2 === null ? "" : String(property.areaM2),
    features: property.features,
    note: property.note ?? "",
  };
}

/**
 * What the advisor knows about this person, and what they own. Both used to be
 * writable only by an approved reading of a note, which meant a fact the
 * advisor simply knew -- that somebody teaches sailing, that somebody has a
 * field in Bodrum -- had nowhere to go without inventing a conversation or a
 * mandate to carry it.
 */
export function ContactKnowledgePanel({ contactId, memory }: { contactId: string; memory: ContactMemory }) {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const propertiesQuery = useQuery({
    queryKey: apiQueryKeys.knownProperties(contactId),
    queryFn: () => listKnownProperties(contactId),
    enabled: Boolean(session),
  });
  const contributionsQuery = useQuery({
    queryKey: apiQueryKeys.contributions(contactId),
    queryFn: () => listContributions(contactId),
    enabled: Boolean(session),
  });

  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [propertyForm, setPropertyForm] = useState<PropertyForm | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNotes() {
    setNotes(memory.keyThingsToRemember.join("\n"));
    setError(null);
    setNotesOpen(true);
  }

  async function submitNotes() {
    if (!session) return;
    const lines = notes.split("\n").map((line) => line.trim()).filter((line) => line.length >= 2).slice(0, 20);
    const refusal = firstSpecialCategoryRefusal(lines);
    if (refusal) return setError(refusal);
    setPending(true); setError(null);
    try {
      await saveContactMemory(session, { contactId, keyThingsToRemember: lines });
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts });
      setNotesOpen(false);
    } catch (next) { setError(next instanceof Error ? next.message : "Hafıza kaydedilemedi."); }
    finally { setPending(false); }
  }

  async function submitProperty() {
    if (!session || !propertyForm) return;
    const parsed = knownPropertyDraftSchema.safeParse({
      contactId,
      propertyId: propertyForm.propertyId,
      address: propertyForm.address,
      regionSlug: propertyForm.regionSlug,
      propertyType: propertyForm.propertyType,
      roomCount: numberOrNull(propertyForm.roomCount),
      areaM2: numberOrNull(propertyForm.areaM2),
      features: propertyForm.features,
      note: propertyForm.note,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Mülk bilgilerini kontrol et.");
    setPending(true); setError(null);
    try {
      await saveKnownProperty(session, parsed.data);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.knownProperties(contactId) });
      setPropertyForm(null);
    } catch (next) { setError(next instanceof Error ? next.message : "Mülk kaydedilemedi."); }
    finally { setPending(false); }
  }

  async function removeProperty(property: KnownPropertyRecord) {
    if (!session) return;
    setPending(true); setError(null);
    try {
      await archiveKnownProperty(session, property.id);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.knownProperties(contactId) });
    } catch (next) { setError(next instanceof Error ? next.message : "Mülk kaldırılamadı."); }
    finally { setPending(false); }
  }

  const properties = propertiesQuery.data ?? [];
  const noteRefusal = specialCategoryRefusal(propertyForm?.note ?? "");

  const contributions = contributionsQuery.data ?? [];
  const ledgerLine = contributionSummaryLine(summariseContributions(contributions));

  return (
    <>
      {/* Who actually brings work is the question that decides who gets called
          back, and the count for it lived in the database and nowhere else. */}
      <SpCard style={styles.card}>
        <View style={styles.heading}>
          <SpText variant="title">Sana kazandırdıkları</SpText>
          {ledgerLine ? <SpText variant="bodySmall" color="deed">{ledgerLine}</SpText> : null}
        </View>
        {contributions.length ? contributions.slice(0, 8).map((entry) => (
          <View key={entry.id} style={[styles.property, { borderTopColor: theme.line }]}>
            <View style={styles.flex}>
              <SpText variant="caption" color="deed">{contributionKindLabels[entry.kind]}</SpText>
              <SpText variant="bodySmall">{entry.note}</SpText>
            </View>
            <SpText variant="caption" color="secondary">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(entry.occurredAt)}</SpText>
          </View>
        )) : (
          <SpText variant="bodySmall" color="secondary">Günlük notta bu kişiyi @ ile etiketlediğinde, kazandırdığı portföy ve müşteriler burada birikir.</SpText>
        )}
      </SpCard>

      <SpCard style={styles.card}>
        <View style={styles.heading}>
          <SpText variant="title">Hatırlanacaklar</SpText>
          <Pressable accessibilityRole="button" onPress={openNotes} style={styles.inlineAction}>
            <Pencil color={theme.deed} size={15} />
            <SpText variant="bodySmall" color="deed">Düzenle</SpText>
          </Pressable>
        </View>
        {memory.keyThingsToRemember.length
          ? memory.keyThingsToRemember.map((entry) => <SpText key={entry} variant="bodySmall" color="secondary">· {entry}</SpText>)
          : <SpText variant="bodySmall" color="secondary">Bu kişi hakkında bildiklerini buraya yazabilirsin — mesleği, ilgi alanı, sana ne dediği.</SpText>}
      </SpCard>

      <SpCard style={styles.card}>
        <View style={styles.heading}>
          <SpText variant="title">Bildiğin gayrimenkuller</SpText>
          <Pressable accessibilityRole="button" onPress={() => { setError(null); setPropertyForm(emptyProperty); }} style={styles.inlineAction}>
            <Plus color={theme.deed} size={15} />
            <SpText variant="bodySmall" color="deed">Mülk ekle</SpText>
          </Pressable>
        </View>
        <SpText variant="caption" color="secondary">Bu kayıtlar yetki anlamına gelmez. Yetki aldığında portföy ekranından portföye dönüştürürsün.</SpText>
        {propertiesQuery.isPending ? <SpText variant="bodySmall" color="secondary">Yükleniyor…</SpText> : properties.length ? properties.map((property) => (
          <View key={property.id} style={[styles.property, { borderTopColor: theme.line }]}>
            <Building2 color={theme.textSecondary} size={17} />
            <View style={styles.flex}>
              <SpText variant="bodySmall">{property.address}</SpText>
              <SpText variant="caption" color="secondary">{knownPropertySummary(property, propertyTypeLabels)}</SpText>
              {property.note ? <SpText variant="caption" color="secondary">{property.note}</SpText> : null}
              {property.hasListing ? <SpText variant="caption" color="deed">Yetkili portföyü var</SpText> : null}
            </View>
            <Pressable accessibilityLabel={`${property.address} bilgisini düzenle`} disabled={pending} hitSlop={8} onPress={() => { setError(null); setPropertyForm(formFor(property)); }}>
              <Pencil color={theme.textSecondary} size={16} />
            </Pressable>
            {property.hasListing ? null : (
              <Pressable accessibilityLabel={`${property.address} kaydını kaldır`} disabled={pending} hitSlop={8} onPress={() => void removeProperty(property)}>
                <Trash2 color={theme.textSecondary} size={16} />
              </Pressable>
            )}
          </View>
        )) : <SpText variant="bodySmall" color="secondary">Henüz kayıtlı mülk yok.</SpText>}
        {error && !notesOpen && !propertyForm ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{error}</SpText> : null}
      </SpCard>

      <Modal animationType="slide" onRequestClose={() => setNotesOpen(false)} visible={notesOpen}>
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
          <View style={styles.sheetHeading}>
            <View style={styles.flex}>
              <SpText variant="caption" color="secondary">KİŞİ HAFIZASI</SpText>
              <SpText variant="title">Bu kişi hakkında bildiklerin</SpText>
            </View>
            <Pressable accessibilityLabel="Kapat" accessibilityRole="button" disabled={pending} onPress={() => setNotesOpen(false)}>
              <X color={theme.textSecondary} size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <SpText variant="caption" color="secondary">Her satır ayrı bir bilgi. Sağlık, inanç, köken, siyasi görüş ve sendika bilgisi kaydedilemez.</SpText>
            <SpField label="Hatırlanacaklar">
              <SpTextarea
                value={notes}
                onChangeText={setNotes}
                placeholder={"Mühendis, üç boyutlu printer'ı var\nKite sörf malzemesi satıyor\nYat konusunda mutlaka sor dedi"}
                style={styles.notesInput}
              />
            </SpField>
            {error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{error}</SpText> : null}
            <SpButton disabled={pending} label={pending ? "Kaydediliyor…" : "Kaydet"} onPress={() => void submitNotes()} size="lg" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setPropertyForm(null)} visible={propertyForm !== null}>
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
          <View style={styles.sheetHeading}>
            <View style={styles.flex}>
              <SpText variant="caption" color="secondary">BİLİNEN GAYRİMENKUL</SpText>
              <SpText variant="title">{propertyForm?.propertyId ? "Mülk bilgisini düzelt" : "Bu kişinin sahip olduğu bir mülk"}</SpText>
              <SpText variant="caption" color="secondary">Yetki anlamına gelmez; sadece bildiğini kaydeder.</SpText>
            </View>
            <Pressable accessibilityLabel="Kapat" accessibilityRole="button" disabled={pending} onPress={() => setPropertyForm(null)}>
              <X color={theme.textSecondary} size={22} />
            </Pressable>
          </View>
          {propertyForm ? (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <SpField label="Adres veya tanım">
                <SpInput value={propertyForm.address} onChangeText={(value) => setPropertyForm({ ...propertyForm, address: value })} placeholder="Örn. Kadıovacık mevkii, 4 dönüm tarla" />
              </SpField>
              <SpField label="Bölge">
                <SpInput value={propertyForm.regionSlug} onChangeText={(value) => setPropertyForm({ ...propertyForm, regionSlug: value })} placeholder="Örn. Çeşme Altı" />
              </SpField>
              <SpField label="Mülk türü">
                <View style={styles.choices}>
                  {propertyTypes.map((type) => (
                    <SpChoice key={type} label={propertyTypeLabels[type]} onPress={() => setPropertyForm({ ...propertyForm, propertyType: type, features: [] })} selected={propertyForm.propertyType === type} />
                  ))}
                </View>
              </SpField>
              {propertyForm.propertyType !== "land" ? (
                <SpField label="Oda">
                  <SpInput keyboardType="numeric" value={propertyForm.roomCount} onChangeText={(value) => setPropertyForm({ ...propertyForm, roomCount: value })} />
                </SpField>
              ) : null}
              <SpField label={propertyForm.propertyType === "land" ? "Arsa alanı m²" : "m²"}>
                <SpInput keyboardType="numeric" value={propertyForm.areaM2} onChangeText={(value) => setPropertyForm({ ...propertyForm, areaM2: value })} />
              </SpField>
              <SpField label="Özellikler">
                <View style={styles.choices}>
                  {featuresForType(propertyForm.propertyType).map((feature) => (
                    <SpChoice
                      key={feature}
                      label={propertyFeatureLabels[feature]}
                      onPress={() => setPropertyForm({ ...propertyForm, features: propertyForm.features.includes(feature) ? propertyForm.features.filter((item) => item !== feature) : [...propertyForm.features, feature] })}
                      selected={propertyForm.features.includes(feature)}
                    />
                  ))}
                </View>
              </SpField>
              <SpField label="Not" optional>
                <SpInput value={propertyForm.note} onChangeText={(value) => setPropertyForm({ ...propertyForm, note: value })} placeholder="Örn. Annesine almış, şu an boş" />
              </SpField>
              {noteRefusal ? <SpText color="ask" variant="caption">{noteRefusal}</SpText> : null}
              {error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{error}</SpText> : null}
              <SpButton disabled={pending || noteRefusal !== null} label={pending ? "Kaydediliyor…" : "Kaydet"} onPress={() => void submitProperty()} size="lg" />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { gap: space.sm },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  inlineAction: { flexDirection: "row", alignItems: "center", gap: space.xs },
  property: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingTop: space.sm, borderTopWidth: 1 },
  flex: { flex: 1, gap: 2 },
  sheetHeading: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg },
  body: { gap: space.lg, padding: space.lg, paddingTop: 0 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  notesInput: { minHeight: 160 },
});
