import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionDirectionLabels,
  interactionDirections,
  interactionEditSchema,
  interactionObjectiveLabels,
  interactionObjectives,
  interactionOccurredAtError,
  type InteractionEdit,
} from "@spherepath/shared";
import { SpText } from "@/shared/ui/SpText";
import { SpDateField } from "@/shared/ui/SpDateField";
import { SpButton, SpChoice, SpField, SpTextarea } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { space } from "@/shared/ui/tokens.generated";
import type { ContactInteractionRecord } from "../resources/contacts";

function localDateTime(value: number): string {
  return new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Correcting the account of a conversation the advisor had themselves. The
 * person, the linked work and the next action are deliberately absent: the
 * follow-up has its own complete-or-reschedule flow, and moving a conversation
 * to another person would rewrite two relationship histories at once.
 */
export function InteractionEditSheet({
  interaction,
  pending,
  error,
  onClose,
  onSave,
}: {
  interaction: ContactInteractionRecord;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (edit: InteractionEdit) => void;
}) {
  const theme = useSpTheme();
  const [channel, setChannel] = useState(interaction.channel);
  const [objective, setObjective] = useState(interaction.objective);
  const [direction, setDirection] = useState(interaction.direction);
  const [outcome, setOutcome] = useState(interaction.outcome ?? "");
  const [askOutcome, setAskOutcome] = useState(interaction.askOutcome);
  const [noteSummary, setNoteSummary] = useState(interaction.noteSummary ?? "");
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(interaction.occurredAt));
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    const occurredAtMs = new Date(occurredAt).getTime();
    if (!Number.isFinite(occurredAtMs)) return setFormError("Görüşme tarihini kontrol et.");
    const timeError = interactionOccurredAtError(occurredAtMs, Date.now());
    if (timeError) return setFormError(timeError);
    const parsed = interactionEditSchema.safeParse({
      interactionId: interaction.id,
      channel, objective, direction, askOutcome,
      outcome: outcome.trim(),
      noteSummary: noteSummary.trim(),
      occurredAt: occurredAtMs,
    });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Görüşme bilgilerini kontrol et.");
    setFormError(null);
    onSave(parsed.data);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.heading}>
          <View style={styles.flex}>
            <SpText variant="caption" color="secondary">GÖRÜŞMEYİ DÜZENLE</SpText>
            <SpText variant="title">Kaydı düzelt veya tamamla</SpText>
          </View>
          <Pressable accessibilityLabel="Kapat" accessibilityRole="button" disabled={pending} onPress={onClose}>
            <X color={theme.textSecondary} size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SpText variant="caption" color="secondary">
            Görüşmenin kendi kaydı. Kişi, bağlı iş ve sonraki adım burada değişmez; takip için “Tamamla veya ertele”yi kullan.
          </SpText>

          <SpDateField label="Görüşme ne zaman oldu" past value={occurredAt} onChange={setOccurredAt} />

          <SpField label="Kısa sonuç">
            <SpTextarea value={outcome} onChangeText={setOutcome} />
          </SpField>

          <SpField label="Kanal">
            <View style={styles.choices}>
              {interactionChannels.map((item) => (
                <SpChoice key={item} label={interactionChannelLabels[item]} onPress={() => setChannel(item)} selected={channel === item} />
              ))}
            </View>
          </SpField>

          <SpField label="Görüşme amacı">
            <View style={styles.choices}>
              {interactionObjectives.map((item) => (
                <SpChoice key={item} label={interactionObjectiveLabels[item]} onPress={() => setObjective(item)} selected={objective === item} />
              ))}
            </View>
          </SpField>

          <SpField label="Yön">
            <View style={styles.choices}>
              {interactionDirections.map((item) => (
                <SpChoice key={item} label={interactionDirectionLabels[item]} onPress={() => setDirection(item)} selected={direction === item} />
              ))}
            </View>
          </SpField>

          <SpField label="Talep sonucu">
            <View style={styles.choices}>
              {askOutcomes.map((item) => (
                <SpChoice key={item} label={askOutcomeLabels[item]} onPress={() => setAskOutcome(item)} selected={askOutcome === item} />
              ))}
            </View>
          </SpField>

          <SpField label="Ek not" optional>
            <SpTextarea value={noteSummary} onChangeText={setNoteSummary} />
          </SpField>

          {formError ?? error ? <SpText accessibilityRole="alert" color="ask" variant="bodySmall">{formError ?? error}</SpText> : null}

          <SpButton
            disabled={pending}
            label={pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
            onPress={submit}
            size="lg"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  body: { gap: space.lg, padding: space.lg, paddingTop: 0 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
