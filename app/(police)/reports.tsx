import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface Report {
    id: string;
    user_id: string;
    description: string;
    lat: number | null;
    lng: number | null;
    photo_path: string | null;
    status: string;
    created_at: string;
    profiles?: { full_name: string | null };
    photoUrl?: string | null;
}

export default function ReportsScreen() {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchReports = async () => {
        const { data, error } = await supabase
            .from('reports')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            // Fetch signed URLs for photos
            const withUrls = await Promise.all(
                (data as Report[]).map(async (r) => {
                    if (r.photo_path) {
                        const { data: urlData } = await supabase.storage
                            .from('report-evidence')
                            .createSignedUrl(r.photo_path, 3600);
                        return { ...r, photoUrl: urlData?.signedUrl ?? null };
                    }
                    return { ...r, photoUrl: null };
                })
            );
            setReports(withUrls);
        }
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        fetchReports();

        const channel = supabase
            .channel('reports_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const formatDate = (iso: string) => new Date(iso).toLocaleString();

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#3B82F6" size="large" />
                <Text style={styles.loadingText}>Loading reports...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>COMMUNITY REPORTS</Text>
                <Text style={styles.headerSub}>{reports.length} TOTAL</Text>
            </View>

            <FlatList
                data={reports}
                keyExtractor={item => item.id}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchReports(); }}
                        tintColor="#3B82F6"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No reports submitted yet.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.reportCard}>
                        {item.photoUrl && (
                            <Image source={{ uri: item.photoUrl }} style={styles.reportPhoto} />
                        )}
                        <View style={styles.reportBody}>
                            <View style={styles.reportTop}>
                                <Text style={styles.reportUser}>
                                    👤 {item.profiles?.full_name ?? 'Unknown'}
                                </Text>
                                <View style={[styles.statusBadge, item.status === 'open' && styles.statusBadgeOpen]}>
                                    <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
                                </View>
                            </View>
                            <Text style={styles.reportDesc}>{item.description}</Text>
                            {item.lat && item.lng && (
                                <Text style={styles.reportCoords}>
                                    📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                                </Text>
                            )}
                            <Text style={styles.reportTime}>{formatDate(item.created_at)}</Text>
                        </View>
                    </View>
                )}
            />
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
    headerSub: { color: '#555', fontSize: 11, letterSpacing: 2 },
    reportCard: {
        marginHorizontal: 16,
        marginVertical: 6,
        backgroundColor: '#111',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#1e1e1e',
    },
    reportPhoto: { width: '100%', height: 160 },
    reportBody: { padding: 14 },
    reportTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    reportUser: { color: '#aaa', fontSize: 13 },
    statusBadge: {
        backgroundColor: '#1a1a1a',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: '#2a2a2a',
    },
    statusBadgeOpen: { borderColor: '#3B82F6' },
    statusBadgeText: { color: '#555', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
    reportDesc: { color: '#ccc', fontSize: 14, lineHeight: 20, marginBottom: 8 },
    reportCoords: { color: '#555', fontSize: 11, marginBottom: 4 },
    reportTime: { color: '#444', fontSize: 11 },
    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { color: '#555', fontSize: 14, letterSpacing: 1 },
});
