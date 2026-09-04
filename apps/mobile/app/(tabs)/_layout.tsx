import { useMemo } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { router, Tabs, usePathname, type Href } from "expo-router";
import { ContactRound, House, ListTodo, Plus, Pyramid } from "lucide-react-native";
import { swipeDestination } from "@/shared/navigation/swipe-tabs";
import { useSpTheme } from "@/shared/ui/theme";

export default function TabsLayout() {
  const theme = useSpTheme();
  const pathname = usePathname();
  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
    onPanResponderRelease: (_, gesture) => {
      const destination = swipeDestination(pathname, gesture.dx, gesture.vx);
      if (destination) router.replace(destination as Href);
    },
  }), [pathname]);

  return (
    <View style={styles.frame} {...swipeResponder.panHandlers}>
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
        <Tabs.Screen name="index" options={{ title: "Akış", tabBarIcon: ({ color }) => <ListTodo color={color} size={21} /> }} />
        <Tabs.Screen name="funnel" options={{ title: "Huni", tabBarIcon: ({ color }) => <Pyramid color={color} size={21} /> }} />
        <Tabs.Screen
          name="capture"
          options={{
            title: "Temas kaydet",
            tabBarIcon: () => <Plus color={theme.onAsk} size={27} />,
            tabBarItemStyle: { marginTop: -16, height: 62, borderRadius: 31, backgroundColor: theme.ask, maxWidth: 62 },
            tabBarLabelStyle: { color: theme.onAsk, fontFamily: "Karla_700Bold", fontSize: 10 },
          }}
        />
        <Tabs.Screen name="listings" options={{ title: "Portföy", tabBarIcon: ({ color }) => <House color={color} size={21} /> }} />
        <Tabs.Screen name="contacts" options={{ title: "Kişiler", tabBarIcon: ({ color }) => <ContactRound color={color} size={21} /> }} />
        <Tabs.Screen name="opportunities" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { flex: 1 } });
