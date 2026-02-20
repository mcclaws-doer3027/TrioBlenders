import { supabase } from '@/lib/supabase';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

/**
 * HX-12 OPTIMIZED LIVE DEMO DASHBOARD
 * Features:
 * 1. Immediate Broadcast: Inserts to DB the moment SOS is pressed.
 * 2. Manual Stop: Allows user to choose when to end recording.
 * 3. Evidence Sync: Logic to upload and update the alert row.
 */

export default function DashboardScreen() {
    // --- PERMISSIONS ---
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
    const [locationStatus, setLocationStatus] = useState<Location.PermissionStatus | null>(null);

    // --- SOS STATE ---
    const [isSOSActive, setIsSOSActive] = useState(false);
    const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('System Ready');

    // --- REFS ---
    const cameraRef = useRef<CameraView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // 1. INITIALIZE PERMISSIONS & REALTIME LISTENER
    useEffect(() => {
        (async () => {
            await requestCameraPermission();
            await requestMicrophonePermission();
            const { status } = await Location.requestForegroundPermissionsAsync();
            setLocationStatus(status);
        })();

        // BULLETPRONT REALTIME LISTENER (Supabase v2)
        const channel = supabase
            .channel('alerts')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sos_alerts' },
                (payload) => {
                    // Prevent alerting ourselves for our own insert
                    // In a real app we'd check user_id, here we just show the alert
                    Alert.alert(
                        '🚨 NEIGHBOR SOS 🚨',
                        'Someone nearby needs help! Location identified.',
                        [{ text: 'WATCH LIVE', style: 'destructive' }, { text: 'DISMISS' }]
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // PULSE ANIMATION TRIGGER
    useEffect(() => {
        if (isSOSActive) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isSOSActive]);

    // 2. SOS START LOGIC (IMMEDIATE BROADCAST)
    const startSOS = async () => {
        if (isSOSActive) return;

        setIsSOSActive(true);
        setStatusText('BROADCASTING...');

        try {
            // A. Fetch location immediately
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const { latitude, longitude } = location.coords;

            // B. IMMEDIATE DB INSERT (Triggers Realtime channel instantly)
            const { data, error } = await supabase
                .from('sos_alerts')
                .insert([{
                    lat: latitude,
                    lng: longitude,
                    status: 'active'
                }])
                .select()
                .single();

            if (error) throw error;
            setActiveAlertId(data.id);
            setStatusText('ALERT LIVE - RECORDING');

            // C. Start Camera Recording
            if (cameraRef.current) {
                cameraRef.current.recordAsync().then(async (video) => {
                    if (video?.uri) {
                        await uploadEvidence(video.uri, data.id);
                    }
                });
            }
        } catch (error: any) {
            console.error(error);
            setIsSOSActive(false);
            setStatusText('Broadcast Error');
            Alert.alert('System Error', error.message || 'Failed to trigger SOS.');
        }
    };

    // 3. SOS STOP LOGIC (EVIDENCE SYNC)
    const stopSOS = () => {
        if (!isSOSActive) return;

        setIsSOSActive(false);
        setStatusText('FINALIZING EVIDENCE');

        if (cameraRef.current) {
            cameraRef.current.stopRecording();
        }
    };

    const uploadEvidence = async (uri: string, alertId: string) => {
        setStatusText('SYNCING VIDEO EVIDENCE');

        try {
            // Convert URI to Blob
            const response = await fetch(uri);
            const blob = await response.blob();

            const fileName = `alert_${alertId}_${Date.now()}.mp4`;

            // Upload to Storage
            const { error: storageError } = await supabase.storage
                .from('sos-evidence')
                .upload(fileName, blob, { contentType: 'video/mp4' });

            if (storageError) throw storageError;

            // Update the existing alert row with the video path
            await supabase
                .from('sos_alerts')
                .update({ video_path: fileName })
                .eq('id', alertId);

            setStatusText('EVIDENCE SECURED');
            setTimeout(() => setStatusText('System Ready'), 3000);
        } catch (error: any) {
            console.error(error);
            setStatusText('Sync Failed');
            Alert.alert('Evidence Error', 'Video captured but failed to upload.');
        } finally {
            setActiveAlertId(null);
        }
    };

    return (
        <View style={styles.container}>
            {/* STEALTH CAMERA BACKGROUND */}
            {(cameraPermission?.granted) && (
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    mode="video"
                    videoQuality="480p"
                />
            )}

            {/* OVERLAY UI */}
            <View style={styles.overlay}>
                <View style={styles.header}>
                    <Text style={styles.appTitle}>HX-12 DEMO</Text>
                    <View style={[styles.pulseDot, { backgroundColor: isSOSActive ? '#FF0000' : '#00FF00' }]} />
                    <Text style={styles.statusLabel}>{statusText}</Text>
                </View>

                <View style={styles.actionSection}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Pressable
                            onPress={isSOSActive ? stopSOS : startSOS}
                            style={[styles.mainButton, isSOSActive ? styles.stopButton : styles.sosButton]}
                        >
                            <Text style={styles.buttonText}>
                                {isSOSActive ? '⏹ STOP' : '🚨 SOS'}
                            </Text>
                        </Pressable>
                    </Animated.View>

                    <Text style={styles.hintText}>
                        {isSOSActive
                            ? 'ALERT IS BROADCASTING LIVE\nTAP STOP TO SYNC EVIDENCE'
                            : 'PRESS TO TRIGGER INSTANT\nNEIGHBORHOOD BROADCAST'}
                    </Text>
                </View>

                <View style={styles.footer}>
                    <View style={styles.realtimeBadge}>
                        <Text style={styles.badgeText}>REALTIME MONITOR ACTIVE</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        padding: 30,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    header: {
        marginTop: 60,
        alignItems: 'center',
    },
    appTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 8,
    },
    pulseDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 20,
        marginBottom: 5,
    },
    statusLabel: {
        color: '#666',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    actionSection: {
        alignItems: 'center',
        width: '100%',
    },
    mainButton: {
        width: 240,
        height: 240,
        borderRadius: 120,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 8,
        elevation: 25,
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
    },
    sosButton: {
        backgroundColor: '#CC0000',
        borderColor: 'rgba(255, 0, 0, 0.2)',
    },
    stopButton: {
        backgroundColor: '#222',
        borderColor: '#444',
    },
    buttonText: {
        color: '#fff',
        fontSize: 44,
        fontWeight: '900',
        letterSpacing: 2,
    },
    hintText: {
        color: '#444',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 40,
        lineHeight: 20,
        fontWeight: '600',
        letterSpacing: 1.5,
    },
    footer: {
        marginBottom: 30,
    },
    realtimeBadge: {
        borderWidth: 1,
        borderColor: '#00FF00',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 4,
    },
    badgeText: {
        color: '#00FF00',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
    },
});
