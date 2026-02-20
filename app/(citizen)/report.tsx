import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Image,
} from 'react-native';

export default function ReportScreen() {
    const { session } = useAuth();
    const [description, setDescription] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const pickPhoto = async () => {
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: false,
        });
        if (!result.canceled && result.assets[0]) {
            setPhotoUri(result.assets[0].uri);
        }
    };

    const pickFromLibrary = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) {
            setPhotoUri(result.assets[0].uri);
        }
    };

    const submitReport = async () => {
        if (!description.trim()) {
            Alert.alert('Required', 'Please describe the issue.');
            return;
        }
        setLoading(true);

        try {
            // Get location
            let lat: number | null = null;
            let lng: number | null = null;
            try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                lat = loc.coords.latitude;
                lng = loc.coords.longitude;
            } catch (e) {
                console.warn('Location unavailable:', e);
            }

            // Upload photo if attached
            let photoPath: string | null = null;
            if (photoUri) {
                const ext = photoUri.split('.').pop() ?? 'jpg';
                const fileName = `report_${Date.now()}.${ext}`;
                const response = await fetch(photoUri);
                const blob = await response.blob();

                const { error: uploadError } = await supabase.storage
                    .from('report-evidence')
                    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

                if (uploadError) throw uploadError;
                photoPath = fileName;
            }

            // Insert report record
            const { error: insertError } = await supabase
                .from('reports')
                .insert({
                    user_id: session?.user?.id,
                    description: description.trim(),
                    lat,
                    lng,
                    photo_path: photoPath,
                    status: 'open',
                });

            if (insertError) throw insertError;

            setSubmitted(true);
            setDescription('');
            setPhotoUri(null);
            setTimeout(() => setSubmitted(false), 3000);
        } catch (e: any) {
            console.error('Report error:', e);
            Alert.alert('Submission Failed', e.message ?? 'Could not submit report.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>REPORT ISSUE</Text>
                    <Text style={styles.subtitle}>Infrastructure, safety hazards & more</Text>
                </View>

                {submitted && (
                    <View style={styles.successBanner}>
                        <Text style={styles.successText}>✓ Report submitted successfully</Text>
                    </View>
                )}

                {/* Photo */}
                <Text style={styles.label}>PHOTO EVIDENCE (OPTIONAL)</Text>
                <View style={styles.photoRow}>
                    <TouchableOpacity
                        style={styles.photoButton}
                        onPress={pickPhoto}
                        accessibilityLabel="Take photo"
                    >
                        <Text style={styles.photoButtonText}>📷 Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.photoButton}
                        onPress={pickFromLibrary}
                        accessibilityLabel="Pick from library"
                    >
                        <Text style={styles.photoButtonText}>🖼 Library</Text>
                    </TouchableOpacity>
                </View>

                {photoUri && (
                    <View style={styles.previewContainer}>
                        <Image source={{ uri: photoUri }} style={styles.preview} />
                        <TouchableOpacity
                            style={styles.removePhoto}
                            onPress={() => setPhotoUri(null)}
                            accessibilityLabel="Remove photo"
                        >
                            <Text style={styles.removePhotoText}>✕ Remove</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Description */}
                <Text style={styles.label}>DESCRIPTION *</Text>
                <TextInput
                    style={styles.textArea}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Broken streetlight at main junction — creates safety risk at night."
                    placeholderTextColor="#444"
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    accessibilityLabel="Issue description"
                />

                <Text style={styles.locationNote}>
                    📍 Your current GPS location will be attached automatically.
                </Text>

                <TouchableOpacity
                    style={[styles.submitButton, loading && styles.submitDisabled]}
                    onPress={submitReport}
                    disabled={loading}
                    accessibilityLabel="Submit report"
                    accessibilityRole="button"
                >
                    {loading ? (
                        <ActivityIndicator color="#0a0a0a" />
                    ) : (
                        <Text style={styles.submitText}>SUBMIT REPORT</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    scroll: { flex: 1 },
    content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
    header: { marginBottom: 32 },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: 3,
    },
    subtitle: {
        color: '#555',
        fontSize: 12,
        letterSpacing: 1,
        marginTop: 6,
    },
    successBanner: {
        backgroundColor: '#0a1f0a',
        borderWidth: 1,
        borderColor: '#2ecc71',
        borderRadius: 6,
        padding: 12,
        marginBottom: 20,
    },
    successText: { color: '#2ecc71', fontSize: 14, textAlign: 'center' },
    label: {
        color: '#666',
        fontSize: 11,
        letterSpacing: 2,
        marginTop: 20,
        marginBottom: 8,
    },
    photoRow: { flexDirection: 'row', gap: 12 },
    photoButton: {
        flex: 1,
        backgroundColor: '#161616',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        borderRadius: 6,
        paddingVertical: 14,
        alignItems: 'center',
    },
    photoButtonText: { color: '#aaa', fontSize: 14 },
    previewContainer: { marginTop: 12, borderRadius: 8, overflow: 'hidden', position: 'relative' },
    preview: { width: '100%', height: 200, borderRadius: 8 },
    removePhoto: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    removePhotoText: { color: '#aaa', fontSize: 12 },
    textArea: {
        backgroundColor: '#161616',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        borderRadius: 6,
        padding: 14,
        color: '#fff',
        fontSize: 15,
        minHeight: 120,
    },
    locationNote: {
        color: '#444',
        fontSize: 12,
        marginTop: 12,
        letterSpacing: 0.5,
    },
    submitButton: {
        backgroundColor: '#FF2D2D',
        borderRadius: 6,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 28,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: {
        color: '#0a0a0a',
        fontWeight: '900',
        fontSize: 15,
        letterSpacing: 2,
    },
});
