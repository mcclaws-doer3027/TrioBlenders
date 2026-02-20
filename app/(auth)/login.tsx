import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function LoginScreen() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please enter your email and password.');
            return;
        }
        setLoading(true);
        const { error } = await signIn(email.trim(), password);
        setLoading(false);
        if (error) {
            Alert.alert('Login Failed', error);
        }
        // On success, AuthContext's useProtectedRoute handles navigation
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                {/* Logo / Title */}
                <View style={styles.header}>
                    <Text style={styles.logo}>⚠ HX-12</Text>
                    <Text style={styles.subtitle}>Neighborhood Safety System</Text>
                    <View style={styles.divider} />
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <Text style={styles.label}>EMAIL</Text>
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="officer@city.gov"
                        placeholderTextColor="#444"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        returnKeyType="next"
                        accessibilityLabel="Email input"
                    />

                    <Text style={styles.label}>PASSWORD</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor="#444"
                        secureTextEntry
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                        accessibilityLabel="Password input"
                    />

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        accessibilityLabel="Sign in"
                        accessibilityRole="button"
                    >
                        {loading ? (
                            <ActivityIndicator color="#0a0a0a" />
                        ) : (
                            <Text style={styles.buttonText}>SIGN IN</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={styles.footer}>
                    Contact your administrator to create an account.
                </Text>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 40,
        alignItems: 'center',
    },
    logo: {
        fontSize: 38,
        fontWeight: '900',
        color: '#FF2D2D',
        letterSpacing: 4,
    },
    subtitle: {
        fontSize: 13,
        color: '#666',
        letterSpacing: 2,
        marginTop: 8,
        textTransform: 'uppercase',
    },
    divider: {
        width: 48,
        height: 2,
        backgroundColor: '#FF2D2D',
        marginTop: 20,
    },
    form: {
        gap: 8,
    },
    label: {
        fontSize: 11,
        color: '#666',
        letterSpacing: 2,
        marginTop: 16,
        marginBottom: 4,
    },
    input: {
        backgroundColor: '#161616',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        borderRadius: 6,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#fff',
        fontSize: 16,
    },
    button: {
        backgroundColor: '#FF2D2D',
        borderRadius: 6,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#0a0a0a',
        fontWeight: '900',
        fontSize: 16,
        letterSpacing: 3,
    },
    footer: {
        color: '#444',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 40,
    },
});
