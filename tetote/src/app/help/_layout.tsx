import { Tabs } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { badgeLabel } from "../../features/badges/client";
import { useBadges } from "../../features/badges/useBadges";

type TabIconProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** 右上に出す件数。0 や未指定なら出さない。 */
  badge?: number;
};

function TabIcon({
  icon,
  label,
  badge,
}: TabIconProps) {
  const badgeText = badgeLabel(badge ?? 0);
  return (
    <View style={styles.tabItem}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon}
          size={28}
          color="#FFFFFF"
        />
        {badgeText && (
          <View style={styles.badge} accessibilityLabel={`未読 ${badgeText} 件`}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </View>

      <Text style={styles.tabLabel}>
        {label}
      </Text>
    </View>
  );
}

// href: null だけでタブバーから消える。tabBarButton を併用すると expo-router が
// 「Cannot use `href` and `tabBarButton` together」を投げ、依頼者側の全画面が真っ白になる。
const hiddenTabOptions = {
  href: null,
  tabBarItemStyle: {
    display: "none" as const,
  },
};

export default function HelpLayout() {
  // 未読メッセージなどの件数を30秒ごとに取り直し、タブに出す。
  const badges = useBadges();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 82,
          backgroundColor: "#E6AA47",
          borderTopWidth: 0,
          paddingTop: 12,
          paddingBottom: 2,
          width: "100%",
          maxWidth: 520,
          alignSelf: "center",
        },
        tabBarItemStyle: {
          height: 82,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              icon={
                focused
                  ? "home"
                  : "home-outline"
              }
              label="ホーム"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chats"
        options={{
          title: "トーク",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              icon={
                focused
                  ? "chatbubble-ellipses"
                  : "chatbubble-ellipses-outline"
              }
              label="トーク"
              badge={badges.unreadMessages}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="character"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="profile"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="request"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="settings"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="request-manual"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="request-voice"
        options={hiddenTabOptions}
      />

      <Tabs.Screen
        name="request-confirm"
        options={hiddenTabOptions}
      />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="report" options={{ href: null }} />
      <Tabs.Screen name="verification" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
    height: 65,
    transform: [{ translateY: 5 }],
  },

  tabLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },

  iconWrap: {
    position: "relative",
  },

  badge: {
    position: "absolute",
    top: -6,
    right: -14,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#B3261E",
    alignItems: "center",
    justifyContent: "center",
  },

  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
});