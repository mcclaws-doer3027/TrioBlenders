import { Tabs } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

export default function CitizenLayout() {
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
                tabBarActiveTintColor: '#FF2D2D',
                tabBarInactiveTintColor: '#555',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                },
            }}
        >
            <Tabs.Screen
                name="sos"
                options={{
                    title: 'SOS',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome5 name="exclamation-triangle" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="report"
                options={{
                    title: 'REPORT',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome5 name="file-alt" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
