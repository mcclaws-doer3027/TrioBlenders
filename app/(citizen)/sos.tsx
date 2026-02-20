import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type SOSStatus =
    | 'idle'
    | 'activating'
    | 'active'
    | 'uploading'
    | 'done';

// Configure notification handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export default function SOSScreen() {
    const { profile, session } = useAuth();
    const permissions = usePermissions();

    const [sosStatus, setSOSStatus] = useState<SOSStatus>('idle');
    const [alertId, setAlertId] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const cameraRef = useRef<CameraView>(null);
    const isRecordingRef = useRef(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Register push token on mount
    useEffect(() => {
        registerPushToken();
    }, []);

    // Pulse animation when SOS is active
    useEffect(() => {
        if (sosStatus === 'active') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [sosStatus]);

    const registerPushToken = async () => {
        if (Platform.OS === 'web') return;
        try {
            const { data: expoPushTokenData } = await Notifications.getExpoPushTokenAsync();
            if (expoPushTokenData && session?.user?.id) {
                await supabase
                    .from('profiles')
                    .update({ push_token: expoPushTokenData })
                    .eq('id', session.user.id);
            }
        } catch (e) {
            console.warn('Failed to get push token:', e);
        }
    };

    const startTimer = () => {
        setElapsedSeconds(0);
        timerRef.current = setInterval(() => {
            setElapsedSeconds(s => s + 1);
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const activateSOS = async () => {
        if (sosStatus !== 'idle') return;
        setSOSStatus('activating');

        try {
            // 1. Fetch location
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const { latitude, longitude } = loc.coords;

            // 2. Insert SOS alert into Supabase
            const { data: alertData, error: alertError } = await supabase
                .from('sos_alerts')
                .insert({
                    user_id: session?.user?.id,
                    lat: latitude,
                    lng: longitude,
                    status: 'active',
                })
                .select()
                .single();

            if (alertError) throw alertError;
            setAlertId(alertData.id);

            // 3. Trigger push notification via Edge Function
            try {
                await supabase.functions.invoke('send-sos-notification', {
                    body: { alert_id: alertData.id, lat: latitude, lng: longitude },
                });
            } catch (e) {
                console.warn('Push notification failed (Edge Function may not be deployed):', e);
            }

            // 4. Start camera recording
            if (cameraRef.current && permissions.camera && permissions.microphone && Platform.OS !== 'web') {
                isRecordingRef.current = true;
                cameraRef.current.recordAsync().then(async (video) => {
                    // Called when stopRecording() resolves
                    if (video?.uri) {
                        await uploadEvidence(video.uri, alertData.id);
                    }
                }).catch(e => console.warn('Recording error:', e));
            }

            setSOSStatus('active');
            startTimer();
        } catch (e: any) {
            console.error('SOS activation error:', e);
            Alert.alert('SOS Error', e.message ?? 'Failed to activate SOS. Please try again.');
            setSOSStatus('idle');
        }
    };

    const deactivateSOS = async () => {
        if (sosStatus !== 'active') return;
        stopTimer();
        setSOSStatus('uploading');

        // Stop camera recording — the .then() in activateSOS handles the upload
        if (cameraRef.current && isRecordingRef.current) {
            isRecordingRef.current = false;
            cameraRef.current.stopRecording();
        } else {
            // Web or no camera — just update status
            if (alertId) {
                await supabase
                    .from('sos_alerts')
                    .update({ status: 'resolved' })
                    .eq('id', alertId);
            }
            setSOSStatus('done');
            setTimeout(() => setSOSStatus('idle'), 2000);
        }
    };

    const uploadEvidence = async (uri: string, id: string) => {
        try {
            const fileExt = uri.split('.').pop() ?? 'mp4';
            const fileName = `sos_${id}_${Date.now()}.${fileExt}`;

            // Fetch the file as a blob
            const response = await fetch(uri);
            const blob = await response.blob();

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('sos-evidence')
                .upload(fileName, blob, {
                    contentType: 'video/mp4',
                    upsert: false,
                });

            if (uploadError) throw uploadError;

            // Update alert row with the file path
            await supabase
                .from('sos_alerts')
                .update({ video_path: fileName, status: 'resolved' })
                .eq('id', id);

            setSOSStatus('done');
            setTimeout(() => {
                setSOSStatus('idle');
                setAlertId(null);
                setElapsedSeconds(0);
            }, 2000);
        } catch (e: any) {
            console.error('Upload error:', e);
            Alert.alert('Upload Failed', e.message ?? 'Evidence upload failed.');
            setSOSStatus('idle');
        }
    };

    const getStatusText = () => {
        switch (sosStatus) {
            case 'idle': return 'Hold to activate SOS';
            case 'activating': return 'Locating & alerting...';
            case 'active': return `RECORDING ${formatTime(elapsedSeconds)}`;
            case 'uploading': return 'Uploading evidence...';
            case 'done': return '✓ Alert sent — evidence saved';
        }
    };

    const getButtonLabel = () => {
        if (sosStatus === 'active') return 'STOP';
        if (sosStatus === 'activating' || sosStatus === 'uploading') return '...';
        return 'SOS';
    };

    const isButtonDisabled = sosStatus === 'activating' || sosStatus === 'uploading' || sosStatus === 'done';

    return (
        <View style={styles.container}>
            {/* Hidden camera view for recording — not visible to user */}
            {Platform.OS !== 'web' && (
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    mode="video"
                    videoQuality="480p"
                />
            )}

            {/* Overlay */}
            <View style={styles.overlay}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.appName}>⚠ HX-12</Text>
                    <Text style={styles.userName}>
                        {profile?.full_name ?? session?.user?.email?.split('@')[0] ?? 'Citizen'}
                    </Text>
                </View>

                {/* Permission Warning */}
                {!permissions.allGranted && (
                    <View style={styles.permWarning}>
                        <Text style={styles.permWarningText}>
                            ⚠ Some permissions missing.{`\n`}Camera/Location/Mic needed for full SOS.
                        </Text>
                    </View>
                )}

                {/* SOS Button */}
                <View style={styles.buttonContainer}>
                    <Animated.View style={[styles.outerRing, { transform: [{ scale: pulseAnim }] }]} />
                    <Animated.View style={[styles.middleRing, { transform: [{ scale: pulseAnim }] }]} />
                    <Pressable
                        style={[
                            styles.sosButton,
                            sosStatus === 'active' && styles.sosButtonActive,
                            isButtonDisabled && styles.sosButtonDisabled,
                        ]}
                        onPress={sosStatus === 'active' ? deactivateSOS : activateSOS}
                        disabled={isButtonDisabled}
                        accessibilityLabel={sosStatus === 'active' ? 'Stop SOS' : 'Activate SOS'}
                        accessibilityRole="button"
                    >
                        <Text style={styles.sosButtonText}>{getButtonLabel()}</Text>
                    </Pressable>
                </View>

                {/* Status */}
                <Text style={[styles.statusText, sosStatus === 'active' && styles.statusTextActive]}>
                    {getStatusText()}
                </Text>

                {/* Active alert info */}
                {alertId && sosStatus === 'active' && (
                    <View style={styles.alertInfo}>
                        <Text style={styles.alertInfoText}>ALERT ID: {alertId.substring(0, 8).toUpperCase()}</Text>
                        <Text style={styles.alertInfoText}>● EMERGENCY SERVICES NOTIFIED</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const RED = '#FF2D2D';
const BG = '#0a0a0a';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BG,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(10,10,10,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 30,
    },
    header: {
        position: 'absolute',
        top: 60,
        left: 24,
        right: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    appName: {
        color: RED,
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 3,
    },
    userName: {
        color: '#666',
        fontSize: 12,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    permWarning: {
        backgroundColor: '#1a0a00',
        borderWidth: 1,
        borderColor: '#FF6A00',
        borderRadius: 8,
        padding: 12,
        marginBottom: 32,
        position: 'absolute',
        top: 110,
        left: 24,
        right: 24,
    },
    permWarningText: {
        color: '#FF6A00',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    buttonContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 240,
        height: 240,
    },
    outerRing: {
        position: 'absolute',
        width: 240,
        height: 240,
        borderRadius: 120,
        borderWidth: 2,
        borderColor: 'rgba(255, 45, 45, 0.2)',
    },
    middleRing: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        borderWidth: 2,
        borderColor: 'rgba(255, 45, 45, 0.4)',
    },
    sosButton: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: RED,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: RED,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 24,
        elevation: 20,
    },
    sosButtonActive: {
        backgroundColor: '#CC0000',
    },
    sosButtonDisabled: {
        opacity: 0.5,
    },
    sosButtonText: {
        color: '#fff',
        fontSize: 36,
        fontWeight: '900',
        letterSpacing: 2,
    },
    statusText: {
        color: '#555',
        fontSize: 14,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginTop: 40,
        textAlign: 'center',
    },
    statusTextActive: {
        color: RED,
    },
    alertInfo: {
        marginTop: 20,
        alignItems: 'center',
        gap: 6,
    },
    alertInfoText: {
        color: '#444',
        fontSize: 11,
        letterSpacing: 1.5,
    },
});
