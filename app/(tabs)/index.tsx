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
 * HX-12 PIVOT DASHBOARD (No-Auth Demo)
 * Combined Sender (SOS Trigger) and Receiver (Realtime Alerts) screen.
 * 
 * Step 1: Hardware Access (Camera, Mic, Location)
 * Step 2: Supabase Realtime (Receiver)
 * Step 3: SOS Flow (Sender - Anonymous)
 */

export default function DashboardScreen() {
    // --- PERMISSIONS ---
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
    const [locationStatus, setLocationStatus] = useState<Location.PermissionStatus | null>(null);

    // --- UI STATE ---
    const [isRecording, setIsRecording] = useState(false);
    const [statusText, setStatusText] = useState('System Standby');

    // --- REFS ---
    const cameraRef = useRef<CameraView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // 1. INITIALIZE PERMISSIONS & REALTIME
    useEffect(() => {
        (async () => {
            // Request permissions
            await requestCameraPermission();
            await requestMicrophonePermission();
            const { status } = await Location.requestForegroundPermissionsAsync();
            setLocationStatus(status);
        })();

        // 2. SUPABASE REALTIME (THE RECEIVER FEATURE)
        // Subscribe to INSERT events on 'sos_alerts' table.
        const channel = supabase
            .channel('sos-realtime-alerts')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sos_alerts' },
                (payload) => {
                    const { lat, lng } = payload.new;
                    // Trigger a global alert on the screen for ALL users
                    Alert.alert(
                        "🚨 SOS TRIGGERED 🚨",
                        `Emergency Alert at location: [${lat.toFixed(5)}, ${lng.toFixed(5)}]`,
                        [{ text: "DISMISS" }]
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // PULSE ANIMATION LOGIC
    useEffect(() => {
        if (isRecording) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isRecording]);

    // 3. THE SOS FLOW (THE SENDER FEATURE)
    const handleSOS = async () => {
        if (isRecording) return;

        setIsRecording(true);
        setStatusText('RECORDING EVIDENCE');

        try {
            // A. Fetch current location immediately
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = location.coords;

            // B. Start silent recording
            if (cameraRef.current) {
                cameraRef.current.recordAsync().then(async (video) => {
                    if (video?.uri) {
                        await processAndUpload(video.uri, latitude, longitude);
                    }
                });

                // Demo recording: 5 seconds
                setTimeout(() => {
                    stopSOS();
                }, 5000);
            }
        } catch (error) {
            console.error(error);
            setIsRecording(false);
            setStatusText('System Error');
            Alert.alert("Hardware Error", "Could not access location or camera.");
        }
    };

    const stopSOS = () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
            setIsRecording(false);
        }
    };

    const processAndUpload = async (uri: string, lat: number, lng: number) => {
        setStatusText('SECURE UPLOAD IN PROGRESS');

        try {
            // 1. Convert URI to Blob
            const response = await fetch(uri);
            const blob = await response.blob();

            const fileName = `demo_sos_${Date.now()}.mp4`;

            // 2. Upload to Supabase Storage
            const { data: storageData, error: storageError } = await supabase.storage
                .from('sos-evidence')
                .upload(fileName, blob, {
                    contentType: 'video/mp4',
                    upsert: false
                });

            if (storageError) throw storageError;

            // 3. Insert into sos_alerts table (Anonymous insert)
            // Removed user_id requirement
            const { error: dbError } = await supabase
                .from('sos_alerts')
                .insert([
                    {
                        lat: lat,
                        lng: lng,
                        video_path: fileName,
                        status: 'active'
                    }
                ]);

            if (dbError) throw dbError;

            setStatusText('ALERT BROADCASTED');
            setTimeout(() => setStatusText('System Standby'), 3000);

        } catch (error: any) {
            console.error(error);
            setStatusText('Upload Failed');
            Alert.alert("Network Sync Error", error.message || "Failed to sync SOS data.");
        }
    };

    return (
        <View style={styles.container}>
            {/* BACKGROUND CAMERA (SILENT RECORDING) */}
            {(cameraPermission?.granted && microphonePermission?.granted) && (
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
                    <Text style={styles.headerTitle}>HX-12 MONITOR</Text>
                    <View style={[styles.statusIndicator, { backgroundColor: isRecording ? '#FF2D2D' : '#00FF00' }]} />
                    <Text style={styles.statusText}>{statusText}</Text>
                </View>

                <View style={styles.centerSection}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Pressable
                            style={[styles.sosButton, isRecording && styles.sosButtonActive]}
                            onPress={handleSOS}
                        >
                            <Text style={styles.sosText}>{isRecording ? 'SYNC' : 'SOS'}</Text>
                        </Pressable>
                    </Animated.View>

                    <Text style={styles.subtext}>
                        ANONYMOUS DEMO MODE ACTIVE
                    </Text>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.badge}>REALTIME NODE ACTIVE</Text>
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
    },
    header: {
        marginTop: 50,
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 6,
    },
    statusIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 15,
        marginBottom: 5,
    },
    statusText: {
        color: '#888',
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    centerSection: {
        alignItems: 'center',
    },
    sosButton: {
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: '#FF2D2D',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 10,
        borderColor: 'rgba(255, 45, 45, 0.2)',
    },
    sosButtonActive: {
        backgroundColor: '#330000',
        borderColor: '#FF2D2D',
    },
    sosText: {
        color: '#fff',
        fontSize: 52,
        fontWeight: '900',
        letterSpacing: 2,
    },
    subtext: {
        color: '#444',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 40,
        letterSpacing: 3,
    },
    footer: {
        marginBottom: 20,
        alignItems: 'center',
    },
    badge: {
        color: '#00FF00',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        borderWidth: 1,
        borderColor: '#00FF00',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 2,
    },
});
