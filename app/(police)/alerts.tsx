import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface SOSAlert {
    id: string;
    user_id: string;
    lat: number;
    lng: number;
    status: 'active' | 'resolved';
    video_path: string | null;
    created_at: string;
    profiles?: { full_name: string | null };
}

export default function AlertsScreen() {
    const { signOut } = useAuth();
    const [alerts, setAlerts] = useState<SOSAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState<SOSAlert | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(false);
    const videoRef = useRef<Video>(null);

    const fetchAlerts = async () => {
        const { data, error } = await supabase
            .from('sos_alerts')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            setAlerts(data as SOSAlert[]);
        }
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        fetchAlerts();

        // Realtime subscription
        const channel = supabase
            .channel('sos_alerts_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
                fetchAlerts();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const openAlert = async (alert: SOSAlert) => {
        setSelectedAlert(alert);
        setVideoUrl(null);

        if (alert.video_path) {
            setVideoLoading(true);
            const { data } = await supabase.storage
                .from('sos-evidence')
                .createSignedUrl(alert.video_path, 3600); // 1-hour signed URL
            if (data?.signedUrl) {
                setVideoUrl(data.signedUrl);
            }
            setVideoLoading(false);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString();
    };

    const formatCoords = (lat: number, lng: number) =>
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#3B82F6" size="large" />
                <Text style={styles.loadingText}>Loading alerts...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>⚠ HX-12 DASHBOARD</Text>
                    <Text style={styles.headerSub}>POLICE COMMAND VIEW</Text>
                </View>
                <TouchableOpacity onPress={signOut} accessibilityLabel="Sign out">
                    <Text style={styles.signOutText}>SIGN OUT</Text>
                </TouchableOpacity>
            </View>

            {/* Stats bar */}
            <View style={styles.statsBar}>
                <View style={styles.stat}>
                    <Text style={styles.statNumber}>{alerts.filter(a => a.status === 'active').length}</Text>
                    <Text style={styles.statLabel}>ACTIVE</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                    <Text style={[styles.statNumber, { color: '#555' }]}>{alerts.length}</Text>
                    <Text style={styles.statLabel}>TOTAL</Text>
                </View>
            </View>

            {/* Alert List */}
            <FlatList
                data={alerts}
                keyExtractor={item => item.id}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchAlerts(); }}
                        tintColor="#3B82F6"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No SOS alerts yet.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.alertCard, item.status === 'active' && styles.alertCardActive]}
                        onPress={() => openAlert(item)}
                        accessibilityLabel={`Alert from ${item.profiles?.full_name ?? 'Unknown'}`}
                    >
                        <View style={styles.alertCardTop}>
                            <View style={styles.alertCardLeft}>
                                <View style={[styles.statusDot, item.status === 'active' && styles.statusDotActive]} />
                                <Text style={styles.alertStatus}>{item.status.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.alertTime}>{formatDate(item.created_at)}</Text>
                        </View>

                        <Text style={styles.alertUser}>
                            👤 {item.profiles?.full_name ?? 'Unknown Citizen'}
                        </Text>
                        <Text style={styles.alertCoords}>
                            📍 {formatCoords(item.lat, item.lng)}
                        </Text>
                        {item.video_path && (
                            <Text style={styles.alertEvidence}>🎬 Evidence recorded</Text>
                        )}
                    </TouchableOpacity>
                )}
            />

            {/* Evidence Modal */}
            <Modal
                visible={selectedAlert !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setSelectedAlert(null)}
            >
                <View style={styles.modal}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>ALERT DETAIL</Text>
                        <TouchableOpacity onPress={() => setSelectedAlert(null)} accessibilityLabel="Close modal">
                            <Text style={styles.modalClose}>✕ CLOSE</Text>
                        </TouchableOpacity>
                    </View>

                    {selectedAlert && (
                        <ScrollView style={styles.modalContent}>
                            <Text style={styles.modalLabel}>ALERT ID</Text>
                            <Text style={styles.modalValue}>{selectedAlert.id}</Text>

                            <Text style={styles.modalLabel}>STATUS</Text>
                            <Text style={[styles.modalValue, selectedAlert.status === 'active' && { color: '#FF2D2D' }]}>
                                {selectedAlert.status.toUpperCase()}
                            </Text>

                            <Text style={styles.modalLabel}>REPORTER</Text>
                            <Text style={styles.modalValue}>
                                {selectedAlert.profiles?.full_name ?? 'Unknown'}
                            </Text>

                            <Text style={styles.modalLabel}>LOCATION (LAT, LNG)</Text>
                            <Text style={styles.modalValue}>
                                {formatCoords(selectedAlert.lat, selectedAlert.lng)}
                            </Text>

                            <Text style={styles.modalLabel}>TIMESTAMP</Text>
                            <Text style={styles.modalValue}>{formatDate(selectedAlert.created_at)}</Text>

                            {/* Video Evidence */}
                            <Text style={styles.modalLabel}>VIDEO EVIDENCE</Text>
                            {videoLoading ? (
                                <View style={styles.videoPlaceholder}>
                                    <ActivityIndicator color="#3B82F6" />
                                    <Text style={styles.videoLoadingText}>Loading secure stream...</Text>
                                </View>
                            ) : videoUrl ? (
                                <Video
                                    ref={videoRef}
                                    source={{ uri: videoUrl }}
                                    style={styles.video}
                                    useNativeControls
                                    resizeMode={ResizeMode.CONTAIN}
                                    shouldPlay={false}
                                />
                            ) : (
                                <View style={styles.videoPlaceholder}>
                                    <Text style={styles.noVideoText}>
                                        {selectedAlert.video_path ? 'Could not load video.' : 'No video recorded.'}
                                    </Text>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    center: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: '#555', fontSize: 13, letterSpacing: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'web' ? 20 : 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    headerTitle: { color: '#3B82F6', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
    headerSub: { color: '#555', fontSize: 10, letterSpacing: 2, marginTop: 2 },
    signOutText: { color: '#555', fontSize: 12, letterSpacing: 1 },
    statsBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    stat: { alignItems: 'center', flex: 1 },
    statNumber: { color: '#FF2D2D', fontSize: 28, fontWeight: '900' },
    statLabel: { color: '#555', fontSize: 10, letterSpacing: 2 },
    statDivider: { width: 1, backgroundColor: '#1a1a1a' },
    alertCard: {
        marginHorizontal: 16,
        marginVertical: 6,
        backgroundColor: '#111',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1e1e1e',
    },
    alertCardActive: {
        borderLeftWidth: 3,
        borderLeftColor: '#FF2D2D',
    },
    alertCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    alertCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#555' },
    statusDotActive: { backgroundColor: '#FF2D2D' },
    alertStatus: { color: '#555', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
    alertTime: { color: '#444', fontSize: 11 },
    alertUser: { color: '#aaa', fontSize: 14, marginBottom: 4 },
    alertCoords: { color: '#555', fontSize: 12, marginBottom: 4 },
    alertEvidence: { color: '#3B82F6', fontSize: 12 },
    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { color: '#555', fontSize: 14, letterSpacing: 1 },
    modal: { flex: 1, backgroundColor: '#0a0a0a' },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    modalTitle: { color: '#3B82F6', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
    modalClose: { color: '#555', fontSize: 12, letterSpacing: 1 },
    modalContent: { padding: 20 },
    modalLabel: { color: '#555', fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 4 },
    modalValue: { color: '#fff', fontSize: 14 },
    video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 8, marginTop: 8 },
    videoPlaceholder: {
        width: '100%',
        height: 160,
        backgroundColor: '#111',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    videoLoadingText: { color: '#555', fontSize: 12 },
    noVideoText: { color: '#444', fontSize: 12 },
});
