import { FontAwesome5 } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function PoliceLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#0a0a0a',
                    borderTopColor: '#1a1a1a',
                    borderTopWidth: 1,
                    height: 60,
                    paddingBottom: 8,
                },
                tabBarActiveTintColor: '#3B82F6',
                tabBarInactiveTintColor: '#555',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                },
            }}
        >
            <Tabs.Screen
                name="alerts"
                options={{
                    title: 'SOS ALERTS',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome5 name="bell" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'REPORTS',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome5 name="clipboard-list" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
