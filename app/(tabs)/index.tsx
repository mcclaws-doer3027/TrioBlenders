import { supabase } from '@/lib/supabase';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { decode } from 'base-64';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

/**
 * HX-12 LIVE DEMO DASHBOARD
 *
 * ANDROID FIX: We do NOT use fetch(uri).blob() to read local camera files.
 * Instead we use expo-file-system to read the video as a base64 string,
 * then decode it into a Uint8Array for a safe Supabase upload on all platforms.
 */
export default function DashboardScreen() {
    // --- PERMISSIONS ---
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    // --- SOS STATE ---
    const [isSOSActive, setIsSOSActive] = useState(false);
    const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('System Ready');

    // --- REFS ---
    const cameraRef = useRef<CameraView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // ─── 1. INIT: PERMISSIONS + REALTIME ───────────────────────────────────────
    useEffect(() => {
        (async () => {
            await requestCameraPermission();
            await requestMicPermission();
            await Location.requestForegroundPermissionsAsync();
        })();

        // BULLETPROOF REALTIME LISTENER (Supabase v2)
        const channel = supabase
            .channel('alerts')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sos_alerts' },
                (_payload) => {
                    Alert.alert(
                        '🚨 NEIGHBOR SOS 🚨',
                        'Someone nearby needs help!',
                        [{ text: 'DISMISS' }]
                    );
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // ─── PULSE ANIMATION ──────────────────────────────────────────────────────
    useEffect(() => {
        if (isSOSActive) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [isSOSActive]);

    // ─── 2. START SOS — IMMEDIATE BROADCAST ───────────────────────────────────
    const startSOS = async () => {
        if (isSOSActive) return;
        setIsSOSActive(true);
        setStatusText('LOCATING...');

        try {
            // A. Fetch location immediately
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });
            const { latitude, longitude } = location.coords;
            setStatusText('BROADCASTING...');

            // B. IMMEDIATE DB INSERT (triggers Realtime for Phone 2 right now)
            const { data, error: insertError } = await supabase
                .from('sos_alerts')
                .insert([{ lat: latitude, lng: longitude, status: 'active' }])
                .select('id')
                .single();

            if (insertError) {
                console.error('SOS Error [DB Insert]:', insertError);
                throw insertError;
            }

            setActiveAlertId(data.id);
            setStatusText('ALERT LIVE — REC');

            // C. Start recording (result is handled when Stop is pressed)
            if (cameraRef.current) {
                cameraRef.current.recordAsync().then(async (video) => {
                    if (video?.uri) {
                        await uploadEvidence(video.uri, data.id);
                    }
                }).catch((err) => {
                    console.error('SOS Error [Camera Record]:', err);
                });
            }
        } catch (error: any) {
            console.error('SOS Error [startSOS]:', error);
            setIsSOSActive(false);
            setStatusText('Broadcast Failed');
            Alert.alert('SOS Error', error?.message ?? 'Failed to trigger alert.');
        }
    };

    // ─── 3. STOP SOS — EVIDENCE SYNC ─────────────────────────────────────────
    const stopSOS = () => {
        if (!isSOSActive) return;
        setIsSOSActive(false);
        setStatusText('FINALIZING EVIDENCE...');
        try {
            // Stopping the recording resolves the recordAsync().then() promise above
            cameraRef.current?.stopRecording();
        } catch (error: any) {
            console.error('SOS Error [stopSOS]:', error);
            setStatusText('Stop Error');
        }
    };

    // ─── 4. UPLOAD EVIDENCE (ANDROID-SAFE) ───────────────────────────────────
    const uploadEvidence = async (uri: string, alertId: string) => {
        setStatusText('SYNCING EVIDENCE...');
        try {
            /**
             * ANDROID FIX:
             * fetch(uri).blob() fails on Android because the local file:// scheme
             * cannot be used as a network request. Instead we:
             * 1. Read the file from disk as a base64 string using expo-file-system.
             * 2. Decode the base64 string into a Uint8Array (binary data).
             * 3. Upload the binary data directly to Supabase Storage.
             */
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            // Decode base64 → binary safely without using fetch
            const binaryString = decode(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const fileName = `alert_${alertId}_${Date.now()}.mp4`;

            const { error: storageError } = await supabase.storage
                .from('sos-evidence')
                .upload(fileName, bytes, { contentType: 'video/mp4', upsert: false });

            if (storageError) {
                console.error('SOS Error [Storage Upload]:', storageError);
                throw storageError;
            }

            // Update the alert row with the video evidence path
            await supabase
                .from('sos_alerts')
                .update({ video_path: fileName, status: 'resolved' })
                .eq('id', alertId);

            setStatusText('EVIDENCE SECURED ✓');
            setTimeout(() => setStatusText('System Ready'), 3000);
        } catch (error: any) {
            console.error('SOS Error [uploadEvidence]:', error);
            setStatusText('Sync Failed');
            Alert.alert('Evidence Error', error?.message ?? 'Video captured but failed to upload.');
        } finally {
            setActiveAlertId(null);
        }
    };

    // ─── UI ───────────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* STEALTH CAMERA — always mounted for instant recording */}
            {cameraPermission?.granted && micPermission?.granted && (
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    mode="video"
                    videoQuality="480p"
                />
            )}

            {/* OVERLAY */}
            <View style={styles.overlay}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.appTitle}>HX-12 DEMO</Text>
                    <View style={[styles.dot, { backgroundColor: isSOSActive ? '#FF0000' : '#00FF00' }]} />
                    <Text style={styles.statusLabel}>{statusText}</Text>
                </View>

                {/* SOS / STOP BUTTON */}
                <View style={styles.center}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Pressable
                            onPress={isSOSActive ? stopSOS : startSOS}
                            style={[styles.mainButton, isSOSActive ? styles.stopBtn : styles.sosBtn]}
                        >
                            <Text style={styles.btnText}>{isSOSActive ? '⏹ STOP' : '🚨 SOS'}</Text>
                        </Pressable>
                    </Animated.View>
                    <Text style={styles.hint}>
                        {isSOSActive
                            ? 'ALERT BROADCASTING\nTAP STOP TO SYNC EVIDENCE'
                            : 'PRESS FOR INSTANT\nNEIGHBORHOOD BROADCAST'}
                    </Text>
                </View>

                {/* FOOTER */}
                <View style={styles.footer}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>REALTIME NODE ACTIVE</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 30,
        paddingVertical: 50,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    header: { alignItems: 'center' },
    appTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 8 },
    dot: { width: 10, height: 10, borderRadius: 5, marginTop: 18, marginBottom: 4 },
    statusLabel: {
        color: '#666',
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    center: { alignItems: 'center' },
    mainButton: {
        width: 240,
        height: 240,
        borderRadius: 120,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 8,
        elevation: 25,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
    },
    sosBtn: {
        backgroundColor: '#CC0000',
        borderColor: 'rgba(255,0,0,0.15)',
        shadowColor: '#FF0000',
    },
    stopBtn: {
        backgroundColor: '#1a1a1a',
        borderColor: '#444',
        shadowColor: '#000',
    },
    btnText: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 2 },
    hint: {
        color: '#444',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 38,
        lineHeight: 20,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    footer: { alignItems: 'center' },
    badge: {
        borderWidth: 1,
        borderColor: '#00FF00',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 4,
    },
    badgeText: { color: '#00FF00', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
});
