import { Tabs } from "expo-router";
import { BriefcaseBusiness, ContactRound, House, ListTodo, Plus } from "lucide-react-native";
import { useSpTheme } from "@/shared/ui/theme";

export default function TabsLayout() {
  const theme = useSpTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.deed,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.chrome,
          borderTopColor: theme.line,
          height: 72,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: "Karla_600SemiBold", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Bugün", tabBarIcon: ({ color }) => <ListTodo color={color} size={21} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Kişiler", tabBarIcon: ({ color }) => <ContactRound color={color} size={21} /> }} />
      <Tabs.Screen
        name="capture"
        options={{
          title: "Kayıt",
          tabBarIcon: () => <Plus color={theme.onAsk} size={27} />,
          tabBarItemStyle: { marginTop: -16, height: 62, borderRadius: 31, backgroundColor: theme.ask, maxWidth: 62 },
          tabBarLabelStyle: { color: theme.onAsk, fontFamily: "Karla_700Bold", fontSize: 10 },
        }}
      />
      <Tabs.Screen name="opportunities" options={{ title: "Fırsatlar", tabBarIcon: ({ color }) => <BriefcaseBusiness color={color} size={21} /> }} />
      <Tabs.Screen name="listings" options={{ title: "Portföy", tabBarIcon: ({ color }) => <House color={color} size={21} /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
